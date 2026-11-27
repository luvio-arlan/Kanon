import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { roundTo } from "../../../math/valuation-scenarios";
import type { KanonDb } from "../../bootstrap";
import {
  type CorporateActionKind,
  corporateActionsTable,
  priceBarsDailyTable,
  thesesTable,
} from "../../schema";
import type { DailyPriceBar } from "./valuation-bands-store";

export type { DailyPriceBar };

export type DailyPriceBarInput = Omit<DailyPriceBar, "volume"> & { volume?: number | null };

const BAR_UPSERT_CHUNK_SIZE = 500;

export async function upsertPriceBars(
  db: KanonDb,
  bars: readonly DailyPriceBarInput[],
): Promise<number> {
  const deduped = new Map<string, DailyPriceBarInput>();
  for (const bar of bars) {
    if (!Number.isFinite(bar.close) || bar.close <= 0) continue;
    deduped.set(`${bar.securityId}:${bar.barDate}`, bar);
  }
  const rows = [...deduped.values()].map((bar) => ({
    securityId: bar.securityId,
    barDate: bar.barDate,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    adjClose: bar.adjClose,
    volume: bar.volume ?? null,
    source: bar.source,
  }));
  for (let i = 0; i < rows.length; i += BAR_UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BAR_UPSERT_CHUNK_SIZE);
    await db
      .insert(priceBarsDailyTable)
      .values(chunk)
      .onConflictDoUpdate({
        target: [priceBarsDailyTable.securityId, priceBarsDailyTable.barDate],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          adjClose: sql`excluded.adj_close`,
          volume: sql`excluded.volume`,
          source: sql`excluded.source`,
        },
      });
  }
  return rows.length;
}

export async function getPriceBarCoverage(
  db: KanonDb,
  securityId: string,
): Promise<{ count: number; latestDate: string | null }> {
  const [row] = await db
    .select({
      cnt: sql<number>`count(*)::int`,
      latest: sql<string | null>`MAX(bar_date)`,
    })
    .from(priceBarsDailyTable)
    .where(eq(priceBarsDailyTable.securityId, securityId));
  return { count: Number(row?.cnt ?? 0), latestDate: row?.latest ?? null };
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

export async function updateThesisPriceByTicker(
  db: KanonDb,
  ticker: string,
  currentPrice: number,
): Promise<void> {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;
  // @kanon-tenant-checked: background market-data sync updates global quote anchor by ticker
  await db
    .update(thesesTable)
    .set({ currentPrice, priceAsOf: new Date() })
    .where(
      and(eq(thesesTable.ticker, ticker.trim().toUpperCase()), eq(thesesTable.status, "active")),
    );
}

export {
  computeRealHistoricalValuationBand,
  type EvaluatedValuationBand,
  evaluateHistoricalValuationBand,
  type PitEpsObservation,
  type SplitEventRef,
} from "./valuation-bands-store";
