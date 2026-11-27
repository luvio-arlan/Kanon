import {
  type DailyBarPoint,
  type DailyPriceBarsBundle,
  type DividendEvent,
  fetchPolygonDailyBars,
  fetchPolygonSplitsRaw,
  fetchYahooDailyBundle,
  type PolygonSplitEvent,
} from "./bars/providers";
import type { MarketAdapterCredentials } from "./types";

export type { DailyBarPoint, DailyPriceBarsBundle, DividendEvent, PolygonSplitEvent };

/** Fetches historical stock split events from Polygon using Bearer authentication. */
export async function fetchPolygonSplits(params: {
  ticker: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<PolygonSplitEvent[]> {
  const token = params.apiKey?.trim() || process.env.POLYGON_API_KEY?.trim();
  if (!token) return [];
  return fetchPolygonSplitsRaw(
    params.ticker.trim().toUpperCase(),
    token,
    params.fetchImpl ?? fetch,
    params.signal,
  );
}

export function mergeSplitsByExDate(
  ...lists: ReadonlyArray<readonly PolygonSplitEvent[]>
): PolygonSplitEvent[] {
  const byDate = new Map<string, PolygonSplitEvent>();
  for (const list of lists) {
    for (const sp of list) {
      if (!byDate.has(sp.exDate) && Number.isFinite(sp.ratio) && sp.ratio > 0) {
        byDate.set(sp.exDate, sp);
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.exDate.localeCompare(b.exDate));
}

function resolvePolygonKey(creds?: MarketAdapterCredentials): string | undefined {
  const explicit = creds?.provider === "polygon" ? creds.apiKey?.trim() : undefined;
  return explicit || process.env.POLYGON_API_KEY?.trim() || undefined;
}

async function tryPolygonBundle(
  ticker: string,
  range: "1mo" | "1y" | "5y",
  polygonKey: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<DailyPriceBarsBundle | null> {
  const toDate = new Date().toISOString().slice(0, 10);
  const days = range === "5y" ? 1825 : range === "1y" ? 365 : 35;
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const [poly, polySplits] = await Promise.all([
    fetchPolygonDailyBars(ticker, from, toDate, polygonKey, fetchImpl, signal).catch(() => null),
    fetchPolygonSplits({ ticker, apiKey: polygonKey, fetchImpl, signal }).catch(() => []),
  ]);
  if (!poly) return null;
  return {
    bars: poly,
    splits: mergeSplitsByExDate(polySplits),
    dividends: [],
    dividendAdjusted: false,
  };
}

/**
 * Fetches daily OHLCV bars plus corporate actions (splits & dividends) from Yahoo/Polygon.
 * Yahoo `events=split|div` provides splits even when POLYGON_API_KEY is unset.
 */
export async function fetchDailyPriceBarsWithEvents(params: {
  ticker: string;
  range?: "1mo" | "1y" | "5y";
  creds?: MarketAdapterCredentials;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<DailyPriceBarsBundle> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const ticker = params.ticker.trim().toUpperCase();
  const range = params.range ?? "5y";
  const polygonKey = resolvePolygonKey(params.creds);
  if (polygonKey) {
    const polyBundle = await tryPolygonBundle(ticker, range, polygonKey, fetchImpl, params.signal);
    if (polyBundle) return polyBundle;
  }
  const yahoo = await fetchYahooDailyBundle(ticker, range, fetchImpl, params.signal).catch(
    () => null,
  );
  return yahoo ?? { bars: [], splits: [], dividends: [], dividendAdjusted: true };
}

/**
 * Fetches split/dividend-adjusted daily OHLCV bars from Polygon (if configured) or Yahoo Finance.
 * Never fabricates synthetic bars when upstream fails.
 */
export async function fetchDailyPriceBars(params: {
  ticker: string;
  range?: "1mo" | "1y" | "5y";
  creds?: MarketAdapterCredentials;
  fetchImpl?: typeof fetch;
}): Promise<DailyBarPoint[]> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const ticker = params.ticker.trim().toUpperCase();
  const range = params.range ?? "5y";
  const polygonKey = resolvePolygonKey(params.creds);
  if (polygonKey) {
    const toDate = new Date().toISOString().slice(0, 10);
    const days = range === "5y" ? 1825 : range === "1y" ? 365 : 35;
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const poly = await fetchPolygonDailyBars(ticker, from, toDate, polygonKey, fetchImpl).catch(
      () => null,
    );
    if (poly) return poly;
  }
  const yahoo = await fetchYahooDailyBundle(ticker, range, fetchImpl).catch(() => null);
  return yahoo?.bars ?? [];
}
