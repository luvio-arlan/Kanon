import {
  reconcileSegmentReport,
  type SegmentAxis,
  type SegmentLine,
  type SegmentReportStatus,
} from "@kanon/core";
import { resolveMemberLabel } from "./member-labels";
import {
  AXIS_QNAMES,
  classifyMemberKind,
  EXT_PROFIT_RE,
  isTargetDuration,
  matchSingleAxisMember,
  REVENUE_PRIORITY,
  STANDARD_PROFIT_PRIORITY,
} from "./segment-rules";
import type { ParsedXbrlInstance, XbrlContext, XbrlFact } from "./xbrl-instance-scan";

export interface ExtractedAxisReport {
  axis: SegmentAxis;
  axisQname: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  revenueConcept: string;
  profitConcept: string | null;
  profitIsStandard: boolean;
  profitReconciled: boolean;
  consolidatedRevenue: number | null;
  segmentRevenueSum: number | null;
  diffPct: number | null;
  status: SegmentReportStatus;
  lines: SegmentLine[];
}

interface ScopedAxisFact {
  fact: XbrlFact;
  ctx: XbrlContext;
  axisQname: string;
  member: string;
}

function collectScopedFacts(
  parsed: ParsedXbrlInstance,
  allowedAxes: readonly string[],
  isQuarterly: boolean,
): ScopedAxisFact[] {
  const matched: ScopedAxisFact[] = [];
  for (const fact of parsed.facts) {
    const ctx = parsed.contexts.get(fact.contextRef);
    if (!ctx || !isTargetDuration(ctx, isQuarterly)) continue;
    if (parsed.documentPeriodEndDate && ctx.endDate !== parsed.documentPeriodEndDate) continue;
    const hit = matchSingleAxisMember(ctx, allowedAxes);
    if (hit) matched.push({ fact, ctx, ...hit });
  }
  return matched;
}

const pickWinningConcept = (facts: readonly XbrlFact[], priority: readonly string[]) =>
  priority.find((c) => facts.some((f) => f.concept === c)) ?? null;

function findConsolidatedValue(
  parsed: ParsedXbrlInstance,
  concept: string | null,
  periodStart: string,
  periodEnd: string,
): number | null {
  if (!concept) return null;
  for (const f of parsed.facts) {
    if (f.concept !== concept) continue;
    const ctx = parsed.contexts.get(f.contextRef);
    if (
      ctx &&
      ctx.dimensions.length === 0 &&
      ctx.startDate === periodStart &&
      ctx.endDate === periodEnd
    ) {
      return f.value;
    }
  }
  return null;
}

function buildSegmentLines(
  scoped: readonly ScopedAxisFact[],
  revConcept: string,
  profitConcept: string | null,
  linkbaseLabels: ReadonlyMap<string, string>,
): SegmentLine[] {
  const byMember = new Map<string, SegmentLine>();
  for (const item of scoped) {
    const existing = byMember.get(item.member) ?? {
      memberQname: item.member,
      ...resolveMemberLabel(item.member, linkbaseLabels),
      kind: classifyMemberKind(item.member),
      revenue: null,
      operatingIncome: null,
    };
    if (item.fact.concept === revConcept) existing.revenue = item.fact.value;
    if (profitConcept && item.fact.concept === profitConcept) {
      existing.operatingIncome = item.fact.value;
    }
    byMember.set(item.member, existing);
  }
  return [...byMember.values()];
}

function reconcileScopedAxis(p: {
  parsed: ParsedXbrlInstance;
  scoped: readonly ScopedAxisFact[];
  axis: SegmentAxis;
  axisQname: string;
  periodStart: string;
  periodEnd: string;
  revConcept: string;
  currency: string;
  linkbaseLabels: ReadonlyMap<string, string>;
}): ExtractedAxisReport {
  const facts = p.scoped.map((m) => m.fact);
  const stdProfit = pickWinningConcept(facts, STANDARD_PROFIT_PRIORITY);
  const extProfit =
    stdProfit ?? p.scoped.find((m) => EXT_PROFIT_RE.test(m.fact.concept))?.fact.concept ?? null;
  const lines = buildSegmentLines(p.scoped, p.revConcept, extProfit, p.linkbaseLabels);
  const consRev = findConsolidatedValue(p.parsed, p.revConcept, p.periodStart, p.periodEnd);
  const consOi = findConsolidatedValue(p.parsed, stdProfit, p.periodStart, p.periodEnd);
  const rec = reconcileSegmentReport({
    lines,
    consolidatedRevenue: consRev,
    consolidatedOperatingIncome: consOi,
    profitIsStandard: stdProfit !== null,
  });
  return {
    axis: p.axis,
    axisQname: p.axisQname,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    currency: p.currency,
    revenueConcept: p.revConcept,
    profitConcept: extProfit,
    profitIsStandard: stdProfit !== null,
    profitReconciled: rec.profitReconciled,
    consolidatedRevenue: consRev,
    segmentRevenueSum: rec.segmentRevenueSum,
    diffPct: rec.diffPct,
    status: rec.status,
    lines,
  };
}

const makeMissingUnit = (
  axis: SegmentAxis,
  axisQname: string,
  periodStart: string,
  periodEnd: string,
  revenueConcept: string,
): ExtractedAxisReport => ({
  axis,
  axisQname,
  periodStart,
  periodEnd,
  currency: "UNK",
  revenueConcept,
  profitConcept: null,
  profitIsStandard: false,
  profitReconciled: false,
  consolidatedRevenue: null,
  segmentRevenueSum: null,
  diffPct: null,
  status: "parse_failed",
  lines: [],
});

/** Extracts and reconciles a single dimensional axis report from a scanned XBRL instance (R2 / U0-7 / P2-2). */
export function extractAxisReport(params: {
  parsed: ParsedXbrlInstance;
  axis: SegmentAxis;
  form: string;
  linkbaseLabels: ReadonlyMap<string, string>;
}): ExtractedAxisReport | null {
  const { parsed, axis, form, linkbaseLabels } = params;
  const matching = collectScopedFacts(
    parsed,
    AXIS_QNAMES[axis],
    form.toUpperCase().startsWith("10-Q"),
  );
  const first = matching[0];
  if (!first?.ctx.startDate || !first.ctx.endDate) return null;
  const { startDate: periodStart, endDate: periodEnd } = first.ctx;
  const scoped = matching.filter(
    (m) => m.ctx.startDate === periodStart && m.ctx.endDate === periodEnd,
  );
  const revConcept = pickWinningConcept(
    scoped.map((m) => m.fact),
    REVENUE_PRIORITY,
  );
  if (!revConcept) return null;
  const revFact = scoped.find((m) => m.fact.concept === revConcept)?.fact ?? first.fact;
  const rawCurr = revFact.unitRef ? parsed.units.get(revFact.unitRef) : undefined;
  const currency = rawCurr && /^[A-Z]{3}$/.test(rawCurr) ? rawCurr : null;
  if (!currency) return makeMissingUnit(axis, first.axisQname, periodStart, periodEnd, revConcept);
  return reconcileScopedAxis({
    parsed,
    scoped,
    axis,
    axisQname: first.axisQname,
    periodStart,
    periodEnd,
    revConcept,
    currency,
    linkbaseLabels,
  });
}
