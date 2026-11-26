import { and, asc, eq, gte, lte } from "drizzle-orm";
import { roundTo } from "../../../math/valuation-scenarios";
import type { SecAnnualFinancial } from "../../../schemas/research";
import type { ValuationBand } from "../../../schemas/v7-research-os";
import type { KanonDb } from "../../bootstrap";
import { type CorporateActionKind, corporateActionsTable, priceBarsDailyTable } from "../../schema";

export interface DailyPriceBarInput {
  securityId: string;
  barDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume?: number | null;
  source: string;
}

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

function extractAnnualEpsByYear(annuals: readonly SecAnnualFinancial[]): Map<number, number> {
  const byYear = new Map<number, number>();
  for (const row of annuals) {
    const m = row.fiscalYear.match(/\d{4}/);
    if (!m || !row.dilutedEps || row.dilutedEps <= 0) continue;
    byYear.set(Number(m[0]), row.dilutedEps);
  }
  return byYear;
}

function resolveTrailingEpsForDate(
  barDate: string,
  epsByYear: ReadonlyMap<number, number>,
): number | null {
  const year = Number(barDate.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return epsByYear.get(year) ?? epsByYear.get(year - 1) ?? null;
}

function collectHistoricalPeObservations(
  bars: readonly DailyPriceBar[],
  epsByYear: ReadonlyMap<number, number>,
): number[] {
  const pes: number[] = [];
  for (const bar of bars) {
    const eps = resolveTrailingEpsForDate(bar.barDate, epsByYear);
    if (!eps || eps <= 0) continue;
    const pe = bar.adjClose / eps;
    if (Number.isFinite(pe) && pe > 1 && pe < 200) pes.push(pe);
  }
  return pes;
}

/**
 * Computes real historical P/E band (P10 / P50 / P90) from daily adjusted price bars
 * paired with annual diluted EPS. Returns `null` if fewer than 20 valid PE observations exist.
 */
export function computeRealHistoricalValuationBand(params: {
  bars: readonly DailyPriceBar[];
  annuals: readonly SecAnnualFinancial[];
  currentPrice: number;
}): ValuationBand | null {
  const epsByYear = extractAnnualEpsByYear(params.annuals);
  if (epsByYear.size === 0 || params.bars.length < 20) return null;
  const pes = collectHistoricalPeObservations(params.bars, epsByYear);
  if (pes.length < 20) return null;
  const sorted = [...pes].sort((a, b) => a - b);
  const latestEps = params.annuals[params.annuals.length - 1]?.dilutedEps ?? null;
  const current =
    latestEps && latestEps > 0 && params.currentPrice > 0
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
