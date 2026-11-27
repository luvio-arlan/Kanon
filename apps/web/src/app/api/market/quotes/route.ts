import { fetchMarketQuotes } from "@kanon/ai";
import {
  type MarketDataSource,
  type MarketQuoteSnapshot,
  MarketQuotesResponseSchema,
} from "@kanon/core";
import {
  buildMarketQuoteCacheKey,
  getCachedMarketQuotes,
  type KanonDb,
  upsertCachedMarketQuotes,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonError, jsonOk } from "../../_lib/http";
import { parseMarketHeaders } from "../../_lib/market-headers";
import { checkPersistentRateLimit } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const QUOTES_RATE_POLICY = { bucket: "market_quotes", maxRequests: 60, windowMs: 60 * 1000 };

function parseTickerList(raw: string | null): string[] {
  if (!raw) return [];
  const items = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9.-]{1,10}$/.test(s));
  return [...new Set(items)].slice(0, 24);
}

function mergeQuoteLookup(params: {
  tickers: readonly string[];
  cachedMap: ReadonlyMap<string, MarketQuoteSnapshot>;
  freshMap: Awaited<ReturnType<typeof fetchMarketQuotes>>;
  providerPref: string;
  shouldPersist: boolean;
}) {
  const quotes: Record<string, MarketQuoteSnapshot> = {};
  const missingTickers: string[] = [];
  const persistEntries: Array<{ cacheKey: string; quote: MarketQuoteSnapshot }> = [];

  for (const ticker of params.tickers) {
    const hit = params.cachedMap.get(ticker);
    if (hit) {
      quotes[ticker] = hit;
      continue;
    }
    const res = params.freshMap.get(ticker);
    if (!res?.ok) {
      missingTickers.push(ticker);
      continue;
    }
    quotes[ticker] = res.quote;
    if (params.shouldPersist) {
      persistEntries.push({
        cacheKey: buildMarketQuoteCacheKey(ticker, params.providerPref),
        quote: res.quote,
      });
    }
  }
  return { quotes, missingTickers, persistEntries };
}

async function resolveQuotesWithDbCache(params: {
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>;
  tickers: readonly string[];
  creds: ReturnType<typeof parseMarketHeaders>;
  bypassCache: boolean;
}) {
  const providerPref = params.creds?.provider ?? "auto";
  const canUseDbCache = !params.bypassCache && !params.creds?.apiKey;
  const cachedMap = canUseDbCache
    ? await params.withDb((tx) =>
        getCachedMarketQuotes(
          tx,
          params.tickers.map((t) => buildMarketQuoteCacheKey(t, providerPref)),
        ),
      )
    : new Map<string, MarketQuoteSnapshot>();

  const toFetch = params.tickers.filter((t) => !cachedMap.has(t));
  const freshMap =
    toFetch.length > 0
      ? await fetchMarketQuotes(toFetch, { creds: params.creds, bypassCache: params.bypassCache })
      : new Map();

  const { quotes, missingTickers, persistEntries } = mergeQuoteLookup({
    tickers: params.tickers,
    cachedMap,
    freshMap,
    providerPref,
    shouldPersist: !params.creds?.apiKey,
  });
  if (persistEntries.length > 0) {
    await params.withDb((tx) => upsertCachedMarketQuotes(tx, persistEntries));
  }
  return { quotes, missingTickers };
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const rateErr = await checkPersistentRateLimit(request, QUOTES_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const tickers = parseTickerList(url.searchParams.get("tickers"));
  if (tickers.length === 0) {
    return jsonError("请提供有效的美股代码列表（如 tickers=NVDA,MU）。", 400, startedAt, "INVALID");
  }
  const { quotes, missingTickers } = await resolveQuotesWithDbCache({
    withDb: auth.withDb,
    tickers,
    creds: parseMarketHeaders(request),
    bypassCache: url.searchParams.get("refresh") === "1",
  });
  const firstQuote = Object.values(quotes)[0];
  const activeSource: MarketDataSource | "none" = firstQuote?.source ?? "none";

  return jsonOk(
    MarketQuotesResponseSchema.parse({
      quotes,
      missingTickers,
      activeSource,
      fetchedAt: new Date().toISOString(),
    }),
    startedAt,
  );
}
