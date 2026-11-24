"use client";

import {
  type MarketDataSource,
  type MarketQuoteSnapshot,
  MarketQuotesResponseSchema,
} from "@kanon/core";
import { useCallback, useEffect, useState } from "react";
import { buildMarketHeaders } from "@/features/ai-settings";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export interface LiveMarketQuotesState {
  quotes: Record<string, MarketQuoteSnapshot>;
  activeSource: MarketDataSource | "none";
  fetchedAt: string | null;
  loading: boolean;
  refresh: (force?: boolean) => Promise<void>;
  mergeQuotes: (next: Record<string, MarketQuoteSnapshot>) => void;
}

export function useLiveMarketQuotes(tickers: readonly string[]): LiveMarketQuotesState {
  const tickerKey = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))]
    .sort()
    .join(",");
  const [quotes, setQuotes] = useState<Record<string, MarketQuoteSnapshot>>({});
  const [activeSource, setActiveSource] = useState<MarketDataSource | "none">("none");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBatch = useCallback(
    async (force = false) => {
      if (!tickerKey) return;
      setLoading(true);
      const url = `/api/market/quotes?tickers=${encodeURIComponent(tickerKey)}${force ? "&refresh=1" : ""}`;
      const res = await kanonFetch(url, MarketQuotesResponseSchema, {
        headers: buildMarketHeaders(),
        fallbackError: "实时行情暂不可用",
      }).finally(() => setLoading(false));
      if (!res.ok) return;
      setQuotes(res.data.quotes);
      setActiveSource(res.data.activeSource);
      setFetchedAt(res.data.fetchedAt);
    },
    [tickerKey],
  );

  useEffect(() => {
    void fetchBatch(false);
  }, [fetchBatch]);

  const mergeQuotes = useCallback((next: Record<string, MarketQuoteSnapshot>) => {
    setQuotes((prev) => ({ ...prev, ...next }));
    setFetchedAt(new Date().toISOString());
  }, []);

  return { quotes, activeSource, fetchedAt, loading, refresh: fetchBatch, mergeQuotes };
}
