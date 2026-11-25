"use client";

import { type MarketQuoteSnapshot, MarketQuotesResponseSchema } from "@kanon/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildMarketHeaders } from "@/shared/lib/client-provider-storage";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export function useThesisLiveQuote(ticker: string) {
  const clean = ticker.trim().toUpperCase();
  const [quote, setQuote] = useState<MarketQuoteSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(
    async (force = false) => {
      if (!clean) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      const url = `/api/market/quotes?tickers=${encodeURIComponent(clean)}${force ? "&refresh=1" : ""}`;
      const res = await kanonFetch(url, MarketQuotesResponseSchema, {
        headers: buildMarketHeaders(),
        fallbackError: "实时行情暂不可用",
        signal: ctrl.signal,
      }).finally(() => {
        if (abortRef.current === ctrl) setLoading(false);
      });
      if (!ctrl.signal.aborted && res.ok && res.data.quotes[clean]) {
        setQuote(res.data.quotes[clean]);
      }
    },
    [clean],
  );

  useEffect(() => {
    void refresh(false);
    return () => abortRef.current?.abort();
  }, [refresh]);

  return { quote, loading, refresh };
}
