import { roundTo } from "@kanon/core";
import { z } from "zod";
import {
  computePriceDelta,
  computeRangePositionPct,
  type MarketDataAdapter,
  type MarketSnapshotResult,
} from "./types";

const FmpQuoteItemSchema = z.object({
  name: z.string().optional(),
  exchange: z.string().optional(),
  price: z.number().finite().positive().optional(),
  previousClose: z.number().finite().positive().optional(),
  change: z.number().finite().optional(),
  changePercentage: z.number().finite().optional(),
  dayHigh: z.number().finite().positive().optional(),
  dayLow: z.number().finite().positive().optional(),
  yearHigh: z.number().finite().positive().optional(),
  yearLow: z.number().finite().positive().optional(),
  volume: z.number().finite().nonnegative().optional(),
  timestamp: z.number().optional(),
});

const FmpAftermarketItemSchema = z.object({
  price: z.number().finite().positive().optional(),
  askPrice: z.number().finite().positive().optional(),
  bidPrice: z.number().finite().positive().optional(),
});

async function tryFmpAftermarket(
  ticker: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  try {
    const url = `https://financialmodelingprep.com/stable/aftermarket-trade?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(token)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const parsed = z.array(FmpAftermarketItemSchema).safeParse(await res.json());
    const item = parsed.success ? parsed.data[0] : undefined;
    const raw = item?.price ?? item?.bidPrice ?? item?.askPrice;
    return raw ? roundTo(raw, 2) : null;
  } catch (err) {
    void err;
    return null;
  }
}

function buildFmpExtended(
  item: z.infer<typeof FmpQuoteItemSchema>,
  regularPrice: number,
  afterPrice: number | null,
) {
  const previousClose = item.previousClose ? roundTo(item.previousClose, 2) : null;
  const regDelta = computePriceDelta(regularPrice, previousClose);
  const postDelta = computePriceDelta(afterPrice, regularPrice);
  const low52 = item.yearLow ? roundTo(item.yearLow, 2) : null;
  const high52 = item.yearHigh ? roundTo(item.yearHigh, 2) : null;
  const effectivePrice = afterPrice ?? regularPrice;
  return {
    previousClose,
    regularChange: item.change !== undefined ? roundTo(item.change, 2) : regDelta.change,
    regularChangePct:
      item.changePercentage !== undefined ? roundTo(item.changePercentage, 2) : regDelta.changePct,
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePct: null,
    postMarketPrice: afterPrice,
    postMarketChange: postDelta.change,
    postMarketChangePct: postDelta.changePct,
    effectivePrice,
    fiftyTwoWeekHigh: high52,
    fiftyTwoWeekLow: low52,
    fiftyTwoWeekPositionPct: computeRangePositionPct(effectivePrice, low52, high52),
  };
}

function buildFmpSnapshot(
  ticker: string,
  item: z.infer<typeof FmpQuoteItemSchema>,
  afterPrice: number | null,
  latencyMs: number,
): MarketSnapshotResult {
  if (!item.price) {
    return { ok: false, ticker, source: "fmp", reason: "FMP 未返回有效股价" };
  }
  const regularPrice = roundTo(item.price, 2);
  return {
    ok: true,
    quote: {
      ticker,
      companyName: item.name?.trim() || undefined,
      exchange: item.exchange?.trim() || undefined,
      currency: "USD",
      sessionState: afterPrice !== null ? "POST" : "REGULAR",
      regularPrice,
      ...buildFmpExtended(item, regularPrice, afterPrice),
      dayHigh: item.dayHigh ? roundTo(item.dayHigh, 2) : null,
      dayLow: item.dayLow ? roundTo(item.dayLow, 2) : null,
      volume: item.volume ?? null,
      source: "fmp",
      tier: "paid",
      asOf: new Date(item.timestamp ? item.timestamp * 1000 : Date.now()).toISOString(),
      latencyMs,
    },
  };
}

export const fmpAdapter: MarketDataAdapter = {
  id: "fmp",
  tier: "paid",
  supportsExtendedHours: true,
  async fetchQuote(ticker, apiKey, fetchImpl) {
    const token = apiKey?.trim() || process.env.FMP_API_KEY?.trim();
    if (!token) {
      return { ok: false, ticker, source: "fmp", reason: "未配置 FMP API Key" };
    }
    const started = performance.now();
    try {
      const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(token)}`;
      const [res, afterPrice] = await Promise.all([
        fetchImpl(url, { signal: AbortSignal.timeout(4500) }),
        tryFmpAftermarket(ticker, token, fetchImpl),
      ]);
      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      if (!res.ok) {
        return { ok: false, ticker, source: "fmp", reason: `FMP 返回 ${res.status}` };
      }
      const parsed = z.array(FmpQuoteItemSchema).safeParse(await res.json());
      const first = parsed.success ? parsed.data[0] : undefined;
      if (!first) {
        return { ok: false, ticker, source: "fmp", reason: "FMP 未匹配到该代码" };
      }
      return buildFmpSnapshot(ticker, first, afterPrice, latencyMs);
    } catch (err) {
      return {
        ok: false,
        ticker,
        source: "fmp",
        reason: err instanceof Error ? err.message.slice(0, 64) : "FMP 请求超时",
      };
    }
  },
};
