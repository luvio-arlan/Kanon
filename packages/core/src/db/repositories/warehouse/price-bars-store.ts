import { and, asc, eq, gte, lte } from "drizzle-orm";
import { roundTo } from "../../../math/valuation-scenarios";
import type { SecAnnualFinancial } from "../../../schemas/research";
import type { ValuationBand } from "../../../schemas/v7-research-os";
import type { KanonDb } from "../../bootstrap";
import { type CorporateActionKind, corporateActionsTable, priceBarsDailyTable } from "../../schema";

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

export type DailyPriceBarInput = Omit<DailyPriceBar, "volume"> & { volume?: number | null };

export async function upsertPriceBars(
  db: KanonDb,
  bars: readonly DailyPriceBarInput[],
): Promise<number> {
  let count = 0;
  for (const bar of bars) {
    if (!Number.isFinite(bar.close) || bar.close <= 0) continue;
    await db
      .insert(priceBarsDailyTable)
      .values({
        securityId: bar.securityId,
        barDate: bar.barDate,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        adjClose: bar.adjClose,
        volume: bar.volume ?? null,
        source: bar.source,
      })
      .onConflictDoUpdate({
        target: [priceBarsDailyTable.securityId, priceBarsDailyTable.barDate],
        set: {
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          adjClose: bar.adjClose,
          volume: bar.volume ?? null,
          source: bar.source,
        },
      });
    count += 1;
  }
  return count;
}

export async function listPriceBars(
  db: KanonDb,
  securityId: string,
  options?: { fromDate?: string; toDate?: string },
): Promise<DailyPriceBar[]> {
  const conds = [eq(priceBarsDailyTable.securityId, securityId)];
  if (options?.fromDate) conds.push(gte(priceBarsDailyTable.barDate, options.fromDate));
  if (options?.toDate) conds.push(lte(priceBarsDailyTable.barDate, options.toDate));
  return db
    .select()
    .from(priceBarsDailyTable)
    .where(and(...conds))
    .orderBy(asc(priceBarsDailyTable.barDate));
}

export async function recordCorporateAction(
  db: KanonDb,
  input: {
    id: string;
    securityId: string;
    exDate: string;
    kind: CorporateActionKind;
    ratio?: number | null;
    amount?: number | null;
    currency?: string;
  },
): Promise<void> {
  await db
    .insert(corporateActionsTable)
    .values({
      id: input.id,
      securityId: input.securityId,
      exDate: input.exDate,
      kind: input.kind,
      ratio: input.ratio ?? null,
      amount: input.amount ?? null,
      currency: input.currency ?? "USD",
    })
    .onConflictDoNothing();
}

export async function listCorporateActions(db: KanonDb, securityId: string) {
  return db
    .select()
    .from(corporateActionsTable)
    .where(eq(corporateActionsTable.securityId, securityId))
    .orderBy(asc(corporateActionsTable.exDate));
}

/** Total return (%) computed strictly from split + dividend adjusted close (`adjClose`). */
export function computeTotalReturnPct(bars: readonly DailyPriceBar[]): number | null {
  if (bars.length < 2) return null;
  const first = bars[0]?.adjClose;
  const last = bars[bars.length - 1]?.adjClose;
  if (!first || !last || first <= 0 || last <= 0) return null;
  return roundTo(((last - first) / first) * 100, 2);
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

function resolvePitEpsAtDate(
  barDate: string,
  pitFacts: readonly PitEpsObservation[],
  splits: readonly SplitEventRef[],
): number | null {
  const visible = pitFacts.filter((f) => f.filedAt <= barDate);
  if (visible.length === 0) return null;
  const byPeriod = new Map<string, PitEpsObservation>();
  for (const f of visible) {
    if (f.duration !== "annual" && f.duration !== "quarter" && f.duration !== "ytd") continue;
    const key = `${f.duration}:${f.periodEnd}`;
    const prev = byPeriod.get(key);
    if (!prev || f.filedAt >= prev.filedAt) byPeriod.set(key, f);
  }
  const latestAnnual = [...byPeriod.values()]
    .filter((f) => f.duration === "annual" && f.value > 0)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  if (!latestAnnual) return null;
  const adjusted = adjustEpsForSplits(latestAnnual.value, latestAnnual.filedAt, splits);
  return adjusted > 0 ? adjusted : null;
}

function buildFallbackPitEpsFromAnnuals(
  annuals: readonly SecAnnualFinancial[],
): PitEpsObservation[] {
  const out: PitEpsObservation[] = [];
  for (const row of annuals) {
    if (!row.dilutedEps || row.dilutedEps <= 0) continue;
    const periodEnd = row.periodEndDate;
    if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) continue;
    const filedMs = Date.parse(`${periodEnd}T00:00:00Z`) + 60 * 86_400_000;
    const filedAt = new Date(filedMs).toISOString().slice(0, 10);
    out.push({ periodEnd, filedAt, duration: "annual", value: row.dilutedEps });
  }
  return out;
}

function collectHistoricalPeObservations(
  bars: readonly DailyPriceBar[],
  pitEpsFacts: readonly PitEpsObservation[],
  splits: readonly SplitEventRef[],
): number[] {
  const pes: number[] = [];
  for (const bar of bars) {
    const eps = resolvePitEpsAtDate(bar.barDate, pitEpsFacts, splits);
    if (!eps || eps <= 0) continue;
    const priceForPe = bar.close;
    const pe = priceForPe / eps;
    if (Number.isFinite(pe) && pe > 1 && pe < 200) pes.push(pe);
  }
  return pes;
}

/**
 * Computes real Point-in-Time historical P/E band (P10 / P50 / P90) from split-adjusted daily bars
 * paired strictly with EPS facts where `filedAt <= barDate` (zero look-ahead bias).
 */
export function computeRealHistoricalValuationBand(params: {
  bars: readonly DailyPriceBar[];
  annuals: readonly SecAnnualFinancial[];
  pitEpsFacts?: readonly PitEpsObservation[];
  splits?: readonly SplitEventRef[];
  currentPrice: number | null;
}): ValuationBand | null {
  if (params.bars.length < 20) return null;
  const epsSource =
    params.pitEpsFacts && params.pitEpsFacts.length > 0
      ? params.pitEpsFacts
      : buildFallbackPitEpsFromAnnuals(params.annuals);
  if (epsSource.length === 0) return null;
  const splits = params.splits ?? [];
  const pes = collectHistoricalPeObservations(params.bars, epsSource, splits);
  if (pes.length < 20) return null;
  const sorted = [...pes].sort((a, b) => a - b);
  const latestBarDate = params.bars[params.bars.length - 1]?.barDate ?? "9999-12-31";
  const latestEps = resolvePitEpsAtDate(latestBarDate, epsSource, splits);
  const current =
    latestEps && latestEps > 0 && params.currentPrice !== null && params.currentPrice > 0
      ? roundTo(params.currentPrice / latestEps, 1)
      : roundTo(sorted[sorted.length - 1] ?? 0, 1);
  const belowCount = sorted.filter((v) => v <= current).length;
  return {
    metricLabel: "P/E",
    current,
    p10: roundTo(quantile(sorted, 0.1), 1),
    p50: roundTo(quantile(sorted, 0.5), 1),
    p90: roundTo(quantile(sorted, 0.9), 1),
    percentileRank: Math.round((belowCount / sorted.length) * 100),
  };
}
