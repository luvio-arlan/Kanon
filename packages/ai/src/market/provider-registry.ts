import crypto from "node:crypto";
import type {
  MarketDataSource,
  MarketProviderPreference,
  MarketProviderTestResponse,
} from "@kanon/core";
import { finnhubAdapter } from "./finnhub-adapter";
import { fmpAdapter } from "./fmp-adapter";
import { polygonAdapter } from "./polygon-adapter";
import type { MarketAdapterCredentials, MarketDataAdapter, MarketSnapshotResult } from "./types";
import { yahooFinanceAdapter } from "./yahoo-adapter";

const QUOTE_TTL_MS = 60 * 1000;
const MAX_SNAPSHOT_CACHE = 500;
const MAX_QUOTE_CONCURRENCY = 5;
const snapshotCache = new Map<string, { expiresAt: number; result: MarketSnapshotResult }>();

const ADAPTER_MAP: Record<MarketDataSource, MarketDataAdapter> = {
  yahoo: yahooFinanceAdapter,
  finnhub: finnhubAdapter,
  fmp: fmpAdapter,
  polygon: polygonAdapter,
};

function resolveConfiguredProvider(creds?: MarketAdapterCredentials): MarketProviderPreference {
  if (creds?.provider && creds.provider !== "auto") return creds.provider;
  const envPref = process.env.MARKET_DATA_PROVIDER?.trim().toLowerCase();
  if (envPref === "polygon" || envPref === "fmp" || envPref === "finnhub" || envPref === "yahoo") {
    return envPref;
  }
  return "auto";
}

function buildAdapterChain(creds?: MarketAdapterCredentials): MarketDataAdapter[] {
  const pref = resolveConfiguredProvider(creds);
  if (pref !== "auto") {
    const primary = ADAPTER_MAP[pref];
    return pref === "yahoo" ? [primary] : [primary, yahooFinanceAdapter];
  }
  const chain: MarketDataAdapter[] = [];
  if (process.env.POLYGON_API_KEY?.trim()) chain.push(polygonAdapter);
  if (process.env.FMP_API_KEY?.trim()) chain.push(fmpAdapter);
  if (process.env.FINNHUB_API_KEY?.trim()) chain.push(finnhubAdapter);
  chain.push(yahooFinanceAdapter);
  return chain;
}

function cacheKey(ticker: string, creds?: MarketAdapterCredentials): string {
  const pref = resolveConfiguredProvider(creds);
  const rawKey = creds?.apiKey?.trim();
  if (!rawKey) return `${ticker}:${pref}:env`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex").slice(0, 12);
  return `${ticker}:${pref}:byok:${keyHash}`;
}

function setBoundedCache(key: string, result: MarketSnapshotResult): void {
  const now = Date.now();
  if (snapshotCache.size >= MAX_SNAPSHOT_CACHE) {
    for (const [k, entry] of snapshotCache.entries()) {
      if (entry.expiresAt <= now) snapshotCache.delete(k);
    }
    while (snapshotCache.size >= MAX_SNAPSHOT_CACHE) {
      const oldestKey = snapshotCache.keys().next().value;
      if (!oldestKey) break;
      snapshotCache.delete(oldestKey);
    }
  }
  snapshotCache.set(key, { expiresAt: now + QUOTE_TTL_MS, result });
}

export function clearMarketQuoteCache(): void {
  snapshotCache.clear();
}

export async function fetchMarketQuote(
  rawTicker: string,
  options?: {
    creds?: MarketAdapterCredentials;
    fetchImpl?: typeof fetch;
    bypassCache?: boolean;
  },
): Promise<MarketSnapshotResult> {
  const ticker = rawTicker.trim().toUpperCase();
  const fetchImpl = options?.fetchImpl ?? fetch;
  const key = cacheKey(ticker, options?.creds);
  if (!options?.bypassCache) {
    const cached = snapshotCache.get(key);
    if (cached && Date.now() < cached.expiresAt) return cached.result;
  }

  const chain = buildAdapterChain(options?.creds);
  let lastFail: MarketSnapshotResult = {
    ok: false,
    ticker,
    source: "yahoo",
    reason: "行情通道暂不可用",
  };

  for (let i = 0; i < chain.length; i += 1) {
    const adapter = chain[i];
    if (!adapter) continue;
    const apiKey = i === 0 ? options?.creds?.apiKey : undefined;
    const res = await adapter.fetchQuote(ticker, apiKey, fetchImpl);
    if (res.ok) {
      setBoundedCache(key, res);
      return res;
    }
    lastFail = res;
  }
  return lastFail;
}

export async function fetchMarketQuotes(
  tickers: readonly string[],
  options?: {
    creds?: MarketAdapterCredentials;
    fetchImpl?: typeof fetch;
    bypassCache?: boolean;
  },
): Promise<Map<string, MarketSnapshotResult>> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const results = new Map<string, MarketSnapshotResult>();
  for (let i = 0; i < unique.length; i += MAX_QUOTE_CONCURRENCY) {
    const batch = unique.slice(i, i + MAX_QUOTE_CONCURRENCY);
    const entries = await Promise.all(
      batch.map(async (ticker) => [ticker, await fetchMarketQuote(ticker, options)] as const),
    );
    for (const [ticker, res] of entries) results.set(ticker, res);
  }
  return results;
}

export async function testMarketProviderConnection(params: {
  provider: MarketProviderPreference;
  apiKey?: string;
  ticker?: string;
  fetchImpl?: typeof fetch;
}): Promise<MarketProviderTestResponse> {
  const ticker = (params.ticker ?? "NVDA").trim().toUpperCase();
  const fetchImpl = params.fetchImpl ?? fetch;
  const target: MarketDataSource = params.provider === "auto" ? "yahoo" : params.provider;
  const adapter = ADAPTER_MAP[target];
  const started = performance.now();
  const res = await adapter.fetchQuote(ticker, params.apiKey, fetchImpl);
  const latencyMs = Math.max(1, Math.round(performance.now() - started));

  if (!res.ok) {
    return {
      ok: false,
      provider: target,
      tier: adapter.tier,
      latencyMs,
      quote: null,
      message: res.reason,
    };
  }
  const sessionNote =
    res.quote.sessionState === "PRE" && res.quote.preMarketPrice
      ? ` · 盘前 $${res.quote.preMarketPrice.toFixed(2)}`
      : res.quote.sessionState === "POST" && res.quote.postMarketPrice
        ? ` · 盘后 $${res.quote.postMarketPrice.toFixed(2)}`
        : "";
  return {
    ok: true,
    provider: res.quote.source,
    tier: res.quote.tier,
    latencyMs: res.quote.latencyMs,
    quote: res.quote,
    message: `${res.quote.source.toUpperCase()} 连通正常 · ${ticker} $${res.quote.regularPrice.toFixed(2)}${sessionNote}`,
  };
}
