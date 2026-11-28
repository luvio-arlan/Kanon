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
