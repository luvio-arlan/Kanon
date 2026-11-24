"use client";

import { type MarketQuoteSnapshot, MarketQuotesResponseSchema } from "@kanon/core";
import { useCallback, useEffect, useState } from "react";
import { buildMarketHeaders } from "@/features/ai-settings";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export function useThesisLiveQuote(ticker: string) {
  const clean = ticker.trim().toUpperCase();
  const [quote, setQuote] = useState<MarketQuoteSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async (force = false) => {
      if (!clean) return;
      setLoading(true);
      const url = `/api/market/quotes?tickers=${encodeURIComponent(clean)}${force ? "&refresh=1" : ""}`;
      const res = await kanonFetch(url, MarketQuotesResponseSchema, {
        headers: buildMarketHeaders(),
        fallbackError: "实时行情暂不可用",
      }).finally(() => setLoading(false));
      if (res.ok && res.data.quotes[clean]) {
        setQuote(res.data.quotes[clean]);
      }
    },
    [clean],
  );

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return { quote, loading, refresh };
}
