import { inArray, lt, sql } from "drizzle-orm";
import {
  type MarketQuoteSnapshot,
  MarketQuoteSnapshotSchema,
} from "../../../contracts/market-contracts";
import type { KanonDb } from "../../client";
import { marketQuotesCacheTable } from "../../schema";

export const SERVERLESS_QUOTE_CACHE_TTL_MS = 90 * 1000;

export function buildMarketQuoteCacheKey(ticker: string, providerPref = "auto"): string {
  return `${ticker.trim().toUpperCase()}:${providerPref.trim().toLowerCase()}`;
}

export async function getCachedMarketQuotes(
  db: KanonDb,
  cacheKeys: readonly string[],
): Promise<Map<string, MarketQuoteSnapshot>> {
  const unique = [...new Set(cacheKeys.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const nowMs = Date.now();
  const rows = await db
    .select()
    .from(marketQuotesCacheTable)
    .where(inArray(marketQuotesCacheTable.cacheKey, unique));

  const hits = new Map<string, MarketQuoteSnapshot>();
  for (const row of rows) {
    if (row.expiresAt.getTime() <= nowMs) continue;
    const parsed = MarketQuoteSnapshotSchema.safeParse(row.payload);
    if (parsed.success) {
      hits.set(row.ticker.toUpperCase(), parsed.data);
    }
  }
  return hits;
}

export async function upsertCachedMarketQuotes(
  db: KanonDb,
  entries: ReadonlyArray<{ cacheKey: string; quote: MarketQuoteSnapshot }>,
  ttlMs = SERVERLESS_QUOTE_CACHE_TTL_MS,
): Promise<void> {
  if (entries.length === 0) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const deduped = new Map(entries.map((item) => [item.cacheKey, item]));
  const rows = [...deduped.values()].map((item) => ({
    cacheKey: item.cacheKey,
    ticker: item.quote.ticker.toUpperCase(),
    source: item.quote.source,
    payload: item.quote,
    fetchedAt: now,
    expiresAt,
  }));
  await db
    .insert(marketQuotesCacheTable)
    .values(rows)
    .onConflictDoUpdate({
      target: marketQuotesCacheTable.cacheKey,
      set: {
        source: sql`excluded.source`,
        payload: sql`excluded.payload`,
        fetchedAt: sql`excluded.fetched_at`,
        expiresAt: sql`excluded.expires_at`,
      },
    });
  if (Math.random() < 0.05) {
    const staleCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await db
      .delete(marketQuotesCacheTable)
      .where(lt(marketQuotesCacheTable.expiresAt, staleCutoff));
  }
}
