import type { MarketDataSource, SparklinePoint } from "@kanon/core";
import {
  clearMarketQuoteCache,
  fetchMarketQuote,
  fetchMarketQuotes,
  testMarketProviderConnection,
} from "./provider-registry";
import type { MarketAdapterCredentials, MarketSnapshotResult } from "./types";
import { fetchYahooSparkline } from "./yahoo-adapter";

export type MarketQuoteSource = MarketDataSource;

export type MarketQuoteResult =
  | { ok: true; ticker: string; price: number; companyName?: string; source: MarketQuoteSource }
  | { ok: false; ticker: string; reason: string };

function toClosingResult(
  res: MarketSnapshotResult,
  mode: "regular" | "extended" = "regular",
): MarketQuoteResult {
  if (!res.ok) return { ok: false, ticker: res.ticker, reason: res.reason };
  return {
    ok: true,
    ticker: res.quote.ticker,
    price: mode === "extended" ? res.quote.effectivePrice : res.quote.regularPrice,
    companyName: res.quote.companyName,
    source: res.quote.source,
  };
}

export async function fetchMarketClosingQuote(
  rawTicker: string,
  fetchImpl: typeof fetch = fetch,
  creds?: MarketAdapterCredentials,
): Promise<MarketQuoteResult> {
  const res = await fetchMarketQuote(rawTicker, { fetchImpl, creds });
  return toClosingResult(res, "regular");
}

export async function fetchMarketClosingQuotes(
  tickers: readonly string[],
  fetchImpl: typeof fetch = fetch,
  creds?: MarketAdapterCredentials,
): Promise<Map<string, MarketQuoteResult>> {
  const map = await fetchMarketQuotes(tickers, { fetchImpl, creds });
  const out = new Map<string, MarketQuoteResult>();
  for (const [ticker, res] of map.entries()) {
    out.set(ticker, toClosingResult(res, "regular"));
  }
  return out;
}

export async function fetchMarketSparkline(
  rawTicker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SparklinePoint[]> {
  return fetchYahooSparkline(rawTicker, fetchImpl);
}

export {
  clearMarketQuoteCache,
  fetchMarketQuote,
  fetchMarketQuotes,
  type MarketAdapterCredentials,
  type MarketSnapshotResult,
  testMarketProviderConnection,
};
