import { roundTo } from "@kanon/core";
import { z } from "zod";
import { computePriceDelta, type MarketDataAdapter, type MarketSnapshotResult } from "./types";

const FinnhubQuoteSchema = z.object({
  c: z.number().finite().positive().optional(),
  d: z.number().finite().nullable().optional(),
  dp: z.number().finite().nullable().optional(),
  h: z.number().finite().positive().optional(),
  l: z.number().finite().positive().optional(),
  pc: z.number().finite().positive().optional(),
  t: z.number().optional(),
});

function buildFinnhubSnapshot(
  ticker: string,
  data: z.infer<typeof FinnhubQuoteSchema>,
  latencyMs: number,
): MarketSnapshotResult {
  if (!data.c) {
    return { ok: false, ticker, source: "finnhub", reason: "Finnhub 未返回有效现价" };
  }
  const regularPrice = roundTo(data.c, 2);
  const previousClose = data.pc ? roundTo(data.pc, 2) : null;
  const fallbackDelta = computePriceDelta(regularPrice, previousClose);
  return {
    ok: true,
    quote: {
      ticker,
      currency: "USD",
      sessionState: "REGULAR",
      regularPrice,
      previousClose,
      regularChange: typeof data.d === "number" ? roundTo(data.d, 2) : fallbackDelta.change,
      regularChangePct: typeof data.dp === "number" ? roundTo(data.dp, 2) : fallbackDelta.changePct,
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePct: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePct: null,
      effectivePrice: regularPrice,
      dayHigh: data.h ? roundTo(data.h, 2) : null,
      dayLow: data.l ? roundTo(data.l, 2) : null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      fiftyTwoWeekPositionPct: null,
      volume: null,
      source: "finnhub",
      tier: "paid",
      asOf: new Date(data.t ? data.t * 1000 : Date.now()).toISOString(),
      latencyMs,
    },
  };
}

export const finnhubAdapter: MarketDataAdapter = {
  id: "finnhub",
  tier: "paid",
  supportsExtendedHours: false,
  async fetchQuote(ticker, apiKey, fetchImpl) {
    const token = apiKey?.trim() || process.env.FINNHUB_API_KEY?.trim();
    if (!token) {
      return { ok: false, ticker, source: "finnhub", reason: "未配置 Finnhub API Key" };
    }
    const started = performance.now();
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(token)}`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(4500) });
      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      if (!res.ok) {
        return { ok: false, ticker, source: "finnhub", reason: `Finnhub 返回 ${res.status}` };
      }
      const parsed = FinnhubQuoteSchema.safeParse(await res.json());
      if (!parsed.success) {
        return { ok: false, ticker, source: "finnhub", reason: "Finnhub 响应结构校验失败" };
      }
      return buildFinnhubSnapshot(ticker, parsed.data, latencyMs);
    } catch (err) {
      return {
        ok: false,
        ticker,
        source: "finnhub",
        reason: err instanceof Error ? err.message.slice(0, 64) : "Finnhub 请求超时",
      };
    }
  },
};
