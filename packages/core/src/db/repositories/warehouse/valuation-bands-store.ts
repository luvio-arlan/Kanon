import { roundTo } from "../../../math/valuation-scenarios";
import type { SecAnnualFinancial } from "../../../schemas/research";
import type { ValuationBand } from "../../../schemas/v7-research-os";

export interface DailyPriceBar {
  securityId: string;
  barDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number | null;
  source: string;
}

export interface SplitEventRef {
  exDate: string;
  ratio: number;
}

export interface PitEpsObservation {
  periodEnd: string;
  filedAt: string;
  duration: "annual" | "quarter" | "ytd" | "instant";
  value: number;
}

export interface EvaluatedValuationBand {
  band: ValuationBand | null;
  reason?: "insufficient_data" | "split_unverified";
}

function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (idx - lo);
}

function adjustEpsForSplits(
  eps: number,
  filedAt: string,
  splits: readonly SplitEventRef[],
): number {
  let factor = 1;
  for (const sp of splits) {
    if (sp.ratio > 0 && sp.exDate > filedAt) factor *= sp.ratio;
  }
  return eps / factor;
}

function resolveTtmEpsFromVisible(
  byPeriod: Map<string, PitEpsObservation>,
  splits: readonly SplitEventRef[],
): number | null {
  const vals = [...byPeriod.values()];
  const sortDesc = (a: PitEpsObservation, b: PitEpsObservation) =>
    b.periodEnd.localeCompare(a.periodEnd);
  const quarters = vals.filter((f) => f.duration === "quarter").sort(sortDesc);
  const annuals = vals.filter((f) => f.duration === "annual").sort(sortDesc);
  const ytds = vals.filter((f) => f.duration === "ytd").sort(sortDesc);
  const adjustedQuarters = quarters.map((q) => ({
    periodEnd: q.periodEnd,
    val: adjustEpsForSplits(q.value, q.filedAt, splits),
  }));
  const latestAnnual = annuals[0];
  if (latestAnnual && !adjustedQuarters.some((q) => q.periodEnd === latestAnnual.periodEnd)) {
    const matchingYtd = ytds.find(
      (y) =>
        y.periodEnd < latestAnnual.periodEnd &&
        Date.parse(latestAnnual.periodEnd) - Date.parse(y.periodEnd) <= 130 * 86_400_000,
    );
    if (matchingYtd) {
      const q4Val =
        adjustEpsForSplits(latestAnnual.value, latestAnnual.filedAt, splits) -
        adjustEpsForSplits(matchingYtd.value, matchingYtd.filedAt, splits);
      adjustedQuarters.push({ periodEnd: latestAnnual.periodEnd, val: q4Val });
      adjustedQuarters.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
    }
  }
  if (adjustedQuarters.length < 4) return null;
  const ttm = adjustedQuarters.slice(0, 4).reduce((sum, q) => sum + q.val, 0);
  return ttm > 0 ? ttm : null;
}

function resolvePitEpsAtDate(
  barDate: string,
  pitFacts: readonly PitEpsObservation[],
  splits: readonly SplitEventRef[],
): { eps: number; basis: "ttm" | "fy" } | null {
  const visible = pitFacts.filter((f) => f.filedAt <= barDate);
  if (visible.length === 0) return null;
  const byPeriod = new Map<string, PitEpsObservation>();
  for (const f of visible) {
    if (f.duration === "instant") continue;
    const key = `${f.duration}:${f.periodEnd}`;
    const prev = byPeriod.get(key);
    if (!prev || f.filedAt >= prev.filedAt) byPeriod.set(key, f);
  }
  const ttm = resolveTtmEpsFromVisible(byPeriod, splits);
  if (ttm !== null) return { eps: ttm, basis: "ttm" };
  const latestAnnual = [...byPeriod.values()]
    .filter((f) => f.duration === "annual" && f.value > 0)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  if (!latestAnnual) return null;
  const adjusted = adjustEpsForSplits(latestAnnual.value, latestAnnual.filedAt, splits);
  return adjusted > 0 ? { eps: adjusted, basis: "fy" } : null;
}

function collectShareHistory(
  annuals: readonly SecAnnualFinancial[],
  pitSharesFacts: readonly PitEpsObservation[] | undefined,
): Array<{ date: string; shares: number }> {
  if (pitSharesFacts && pitSharesFacts.length > 0) {
    const byDate = new Map<string, PitEpsObservation>();
    for (const f of pitSharesFacts) {
      if (f.value <= 0) continue;
      const prev = byDate.get(f.periodEnd);
      if (!prev || f.filedAt >= prev.filedAt) byDate.set(f.periodEnd, f);
    }
    return [...byDate.values()]
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
      .map((f) => ({ date: f.periodEnd, shares: f.value }));
  }
  return annuals
    .flatMap((a) => {
      const shares = a.sharesOutstanding ?? a.dilutedShares;
      return shares && shares > 0 && a.periodEndDate ? [{ date: a.periodEndDate, shares }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function hasUnverifiedShareJump(
  annuals: readonly SecAnnualFinancial[],
  pitSharesFacts: readonly PitEpsObservation[] | undefined,
  splits: readonly SplitEventRef[],
): boolean {
  const points = collectShareHistory(annuals, pitSharesFacts);
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr || prev.shares <= 0) continue;
    const ratio = curr.shares / prev.shares;
    const isJump = ratio > 1.8 || ratio < 0.55;
    if (isJump && !splits.some((sp) => sp.exDate >= prev.date && sp.exDate <= curr.date)) {
      return true;
    }
  }
  return false;
}

function buildFallbackPitEpsFromAnnuals(
  annuals: readonly SecAnnualFinancial[],
): PitEpsObservation[] {
  const out: PitEpsObservation[] = [];
  for (const row of annuals) {
    if (!row.dilutedEps || row.dilutedEps <= 0) continue;
    const periodEnd = row.periodEndDate;
    if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) continue;
    const filedAt = new Date(Date.parse(`${periodEnd}T00:00:00Z`) + 60 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    out.push({ periodEnd, filedAt, duration: "annual", value: row.dilutedEps });
  }
  return out;
}

function collectHistoricalPeObservations(
  bars: readonly DailyPriceBar[],
  pitEpsFacts: readonly PitEpsObservation[],
  splits: readonly SplitEventRef[],
): { pes: number[]; epsBasis: "ttm" | "fy" } {
  const pes: number[] = [];
  let sawTtm = false;
  for (const bar of bars) {
    const resolved = resolvePitEpsAtDate(bar.barDate, pitEpsFacts, splits);
    if (!resolved || resolved.eps <= 0) continue;
    if (resolved.basis === "ttm") sawTtm = true;
    const pe = bar.close / resolved.eps;
    if (Number.isFinite(pe) && pe > 1 && pe < 200) pes.push(pe);
  }
  return { pes, epsBasis: sawTtm ? "ttm" : "fy" };
}

export function evaluateHistoricalValuationBand(params: {
  bars: readonly DailyPriceBar[];
  annuals: readonly SecAnnualFinancial[];
  pitEpsFacts?: readonly PitEpsObservation[];
  pitSharesFacts?: readonly PitEpsObservation[];
  splits?: readonly SplitEventRef[];
  currentPrice: number | null;
}): EvaluatedValuationBand {
  if (params.bars.length < 20) return { band: null, reason: "insufficient_data" };
  const splits = params.splits ?? [];
  if (hasUnverifiedShareJump(params.annuals, params.pitSharesFacts, splits)) {
    return { band: null, reason: "split_unverified" };
  }
  const epsSource =
    params.pitEpsFacts && params.pitEpsFacts.length > 0
      ? params.pitEpsFacts
      : buildFallbackPitEpsFromAnnuals(params.annuals);
  if (epsSource.length === 0) return { band: null, reason: "insufficient_data" };
  const { pes, epsBasis } = collectHistoricalPeObservations(params.bars, epsSource, splits);
  if (pes.length < 20) return { band: null, reason: "insufficient_data" };
  const sorted = [...pes].sort((a, b) => a - b);
  const latestBarDate = params.bars[params.bars.length - 1]?.barDate ?? "9999-12-31";
  const latestResolved = resolvePitEpsAtDate(latestBarDate, epsSource, splits);
  const current =
    latestResolved &&
    latestResolved.eps > 0 &&
    params.currentPrice !== null &&
    params.currentPrice > 0
      ? roundTo(params.currentPrice / latestResolved.eps, 1)
      : null;
  const percentileRank =
    current !== null
      ? Math.round((sorted.filter((v) => v <= current).length / sorted.length) * 100)
      : null;
  return {
    band: {
      metricLabel: "P/E",
      current,
      p10: roundTo(quantile(sorted, 0.1), 1),
      p50: roundTo(quantile(sorted, 0.5), 1),
      p90: roundTo(quantile(sorted, 0.9), 1),
      percentileRank,
      epsBasis,
    },
  };
}

/**
 * Computes real Point-in-Time historical P/E band (P10 / P50 / P90) from split-adjusted daily bars
 * paired strictly with TTM/FY EPS facts where `filedAt <= barDate` (zero look-ahead bias).
 */
export function computeRealHistoricalValuationBand(params: {
  bars: readonly DailyPriceBar[];
  annuals: readonly SecAnnualFinancial[];
  pitEpsFacts?: readonly PitEpsObservation[];
  pitSharesFacts?: readonly PitEpsObservation[];
  splits?: readonly SplitEventRef[];
  currentPrice: number | null;
}): ValuationBand | null {
  return evaluateHistoricalValuationBand(params).band;
}
