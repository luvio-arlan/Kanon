import type { FinancialFactDuration } from "../../../contracts/financial-concepts";
import { roundTo } from "../../../math/valuation-scenarios";

export interface UpsertFilingInput {
  accession: string;
  securityId: string;
  cik: string;
  form: string;
  filedAt: string;
  periodEnd?: string | null;
  fiscalYear?: number | null;
  fiscalPeriod?: string | null;
  items?: string[];
  primaryDocUrl: string;
  amendsAccession?: string | null;
  parseStatus?: string;
}

export interface UpsertFinancialFactInput {
  id: string;
  securityId: string;
  accession: string;
  concept: string;
  xbrlTag: string;
  taxonomy?: string;
  periodStart?: string | null;
  periodEnd: string;
  duration: FinancialFactDuration;
  fiscalYear?: number | null;
  fiscalPeriod?: string | null;
  value: number;
  unit?: string;
  currency?: string;
  dimensions?: Record<string, string>;
  filedAt: string;
  isLatestForPeriod?: boolean;
}

export interface PitFinancialFact {
  id: string;
  accession: string;
  concept: string;
  xbrlTag: string;
  taxonomy: string;
  periodStart: string | null;
  periodEnd: string;
  duration: FinancialFactDuration;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  value: number;
  unit: string;
  currency: string;
  filedAt: string;
}

export type RestatementKind = "restatement" | "split_recast";

export interface FactRestatement {
  concept: string;
  periodEnd: string;
  originalAccession: string;
  originalFiledAt: string;
  originalValue: number;
  restatedAccession: string;
  restatedFiledAt: string;
  restatedValue: number;
  deltaPct: number;
  kind: RestatementKind;
}

const PER_SHARE_CONCEPTS = new Set(["diluted_eps", "basic_eps"]);
const SHARE_COUNT_CONCEPTS = new Set(["diluted_shares", "shares_outstanding"]);

export function isSplitSensitiveConcept(concept: string): boolean {
  return PER_SHARE_CONCEPTS.has(concept) || SHARE_COUNT_CONCEPTS.has(concept);
}

function computeSplitFactorBetween(
  splits: ReadonlyArray<{ exDate: string; ratio: number }>,
  origFiledAt: string,
  latestFiledAt: string,
): number {
  let factor = 1;
  for (const sp of splits) {
    if (sp.exDate > origFiledAt && sp.exDate <= latestFiledAt && sp.ratio > 0) factor *= sp.ratio;
  }
  return factor;
}

function normalizeOrigForSplits(concept: string, origValue: number, splitFactor: number): number {
  if (splitFactor === 1) return origValue;
  if (PER_SHARE_CONCEPTS.has(concept)) return origValue / splitFactor;
  if (SHARE_COUNT_CONCEPTS.has(concept)) return origValue * splitFactor;
  return origValue;
}

type RestatementFactRow = Pick<
  PitFinancialFact,
  "accession" | "periodStart" | "periodEnd" | "duration" | "value" | "filedAt"
>;

function evaluateSinglePeriodGroup(
  list: readonly RestatementFactRow[],
  opts: {
    concept: string;
    needsSplits: boolean;
    splits: ReadonlyArray<{ exDate: string; ratio: number }>;
    thresholdPct: number;
    includeSplitRecasts: boolean;
  },
): FactRestatement | null {
  const orig = list[0];
  const latest = list[list.length - 1];
  if (list.length < 2 || !orig || !latest || orig.value === 0) return null;
  const factor = opts.needsSplits
    ? computeSplitFactorBetween(opts.splits, orig.filedAt, latest.filedAt)
    : 1;
  const adjustedOrig = normalizeOrigForSplits(opts.concept, orig.value, factor);
  const rawDeltaPct = ((latest.value - orig.value) / Math.abs(orig.value)) * 100;
  const adjDeltaPct = ((latest.value - adjustedOrig) / Math.abs(adjustedOrig)) * 100;
  const isReal = Math.abs(adjDeltaPct) >= opts.thresholdPct;
  const isSplitRecast = !isReal && factor !== 1 && Math.abs(rawDeltaPct) >= opts.thresholdPct;
  if (!isReal && !(isSplitRecast && opts.includeSplitRecasts)) return null;
  return {
    concept: opts.concept,
    periodEnd: orig.periodEnd,
    originalAccession: orig.accession,
    originalFiledAt: orig.filedAt,
    originalValue: orig.value,
    restatedAccession: latest.accession,
    restatedFiledAt: latest.filedAt,
    restatedValue: latest.value,
    deltaPct: roundTo(adjDeltaPct, 2),
    kind: isReal ? "restatement" : "split_recast",
  };
}

export function evaluateFactRestatements(params: {
  concept: string;
  rows: readonly RestatementFactRow[];
  splits: ReadonlyArray<{ exDate: string; ratio: number }>;
  thresholdPct: number;
  includeSplitRecasts: boolean;
}): FactRestatement[] {
  const grouped = new Map<string, RestatementFactRow[]>();
  for (const r of params.rows) {
    const key = `${r.periodEnd}|${r.periodStart ?? ""}|${r.duration}`;
    const list = grouped.get(key) ?? [];
    list.push(r);
    grouped.set(key, list);
  }
  const opts = { ...params, needsSplits: isSplitSensitiveConcept(params.concept) };
  const alerts: FactRestatement[] = [];
  for (const list of grouped.values()) {
    const item = evaluateSinglePeriodGroup(list, opts);
    if (item) alerts.push(item);
  }
  return alerts;
}
