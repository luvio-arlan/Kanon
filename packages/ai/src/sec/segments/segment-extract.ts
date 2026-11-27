import {
  reconcileSegmentReport,
  type SegmentAxis,
  type SegmentLine,
  type SegmentLineKind,
  type SegmentReportStatus,
} from "@kanon/core";
import { resolveMemberLabel } from "./member-labels";
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

const AXIS_QNAMES: Record<SegmentAxis, readonly string[]> = {
  business: ["us-gaap:StatementBusinessSegmentsAxis", "ifrs-full:SegmentsAxis"],
  geography: ["srt:StatementGeographicalAxis", "ifrs-full:GeographicalAreasAxis"],
  product: ["srt:ProductOrServiceAxis", "ifrs-full:ProductsAndServicesAxis"],
};

const CONSOLIDATION_AXIS_RE = /(?:ConsolidationItemsAxis|SegmentConsolidationItemsAxis)$/i;
const OPERATING_SEGMENTS_MEMBER_RE = /OperatingSegmentsMember$/i;

const REVENUE_PRIORITY = [
  "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
  "us-gaap:Revenues",
  "ifrs-full:Revenue",
];
const STANDARD_PROFIT_PRIORITY = [
  "us-gaap:OperatingIncomeLoss",
  "ifrs-full:ProfitLossFromOperatingActivities",
];

function isTargetDuration(ctx: XbrlContext, isQuarterly: boolean): boolean {
  if (!ctx.startDate || !ctx.endDate) return false;
  const ms = Date.parse(`${ctx.endDate}T00:00:00Z`) - Date.parse(`${ctx.startDate}T00:00:00Z`);
  if (!Number.isFinite(ms)) return false;
  const days = Math.round(ms / 86_400_000);
  return isQuarterly ? days >= 65 && days <= 120 : days >= 320 && days <= 395;
}

function classifyMemberKind(memberQname: string): SegmentLineKind {
  if (/IntersegmentElimination|EliminationOfIntersegment/i.test(memberQname)) return "elimination";
  if (/CorporateNonSegment|UnallocatedAmounts/i.test(memberQname)) return "corporate";
  if (/MaterialReconcilingItems|ReconcilingItems/i.test(memberQname)) return "reconciling";
  return "segment";
}

function matchSingleAxisMember(
  ctx: XbrlContext,
  allowedAxes: readonly string[],
): { axisQname: string; member: string } | null {
  const targetDims = ctx.dimensions.filter((d) => allowedAxes.includes(d.dimension));
  if (targetDims.length !== 1) return null;
  const othersAllowed = ctx.dimensions
    .filter((d) => !allowedAxes.includes(d.dimension))
    .every(
      (d) => CONSOLIDATION_AXIS_RE.test(d.dimension) && OPERATING_SEGMENTS_MEMBER_RE.test(d.member),
    );
  const target = targetDims[0];
  return othersAllowed && target ? { axisQname: target.dimension, member: target.member } : null;
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

function pickWinningConcept(
  facts: readonly XbrlFact[],
  priority: readonly string[],
): string | null {
  return priority.find((c) => facts.some((f) => f.concept === c)) ?? null;
}

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

/** Extracts and reconciles a single dimensional axis report from a scanned XBRL instance (R2). */
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
  const facts = scoped.map((m) => m.fact);
  const revConcept = pickWinningConcept(facts, REVENUE_PRIORITY) ?? "us-gaap:Revenues";
  const stdProfit = pickWinningConcept(facts, STANDARD_PROFIT_PRIORITY);
  const profitConcept =
    stdProfit ??
    scoped.find((m) => !REVENUE_PRIORITY.includes(m.fact.concept))?.fact.concept ??
    null;
  const lines = buildSegmentLines(scoped, revConcept, profitConcept, linkbaseLabels);
  const consRev = findConsolidatedValue(parsed, revConcept, periodStart, periodEnd);
  const consOi = findConsolidatedValue(parsed, stdProfit, periodStart, periodEnd);
  const rec = reconcileSegmentReport({
    lines,
    consolidatedRevenue: consRev,
    consolidatedOperatingIncome: consOi,
    profitIsStandard: stdProfit !== null,
  });
  return {
    axis,
    axisQname: first.axisQname,
    periodStart,
    periodEnd,
    currency: (parsed.units.get(first.fact.unitRef) ?? "USD").slice(0, 3),
    revenueConcept: revConcept,
    profitConcept,
    profitIsStandard: stdProfit !== null,
    consolidatedRevenue: consRev,
    segmentRevenueSum: rec.segmentRevenueSum,
    diffPct: rec.diffPct,
    status: rec.status,
    lines,
  };
}
