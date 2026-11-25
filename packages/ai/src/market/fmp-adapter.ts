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
  timestamp: z.number().optional(),
});

async function tryFmpAftermarket(
  ticker: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<{ price: number; timestamp?: number } | null> {
  try {
    const url = `https://financialmodelingprep.com/stable/aftermarket-trade?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(token)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const parsed = z.array(FmpAftermarketItemSchema).safeParse(await res.json());
    const item = parsed.success ? parsed.data[0] : undefined;
    const raw = item?.price ?? item?.bidPrice ?? item?.askPrice;
    return raw ? { price: roundTo(raw, 2), timestamp: item?.timestamp } : null;
  } catch (err) {
    void err;
    return null;
  }
}

function resolveFreshAftermarket(
  quoteTs: number | undefined,
  after: { price: number; timestamp?: number } | null,
): number | null {
  if (!after) return null;
  if (typeof quoteTs === "number" && typeof after.timestamp === "number") {
    const afterSec = after.timestamp > 1e12 ? Math.floor(after.timestamp / 1000) : after.timestamp;
    if (afterSec < quoteTs) return null;
  }
  return after.price;
}

function getUsEasternSession(now = new Date()): "PRE" | "REGULAR" | "POST" | "CLOSED" {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return "CLOSED";
  const mins = Number(parts.hour ?? 0) * 60 + Number(parts.minute ?? 0);
  if (mins >= 570 && mins < 960) return "REGULAR";
  if (mins >= 240 && mins < 570) return "PRE";
  if (mins >= 960 && mins < 1200) return "POST";
  return "CLOSED";
}

function buildFmpExtended(
  item: z.infer<typeof FmpQuoteItemSchema>,
  regularPrice: number,
  afterPrice: number | null,
  isPre: boolean,
) {
  const previousClose = item.previousClose ? roundTo(item.previousClose, 2) : null;
  const regDelta = computePriceDelta(regularPrice, previousClose);
  const extDelta = computePriceDelta(afterPrice, regularPrice);
  const low52 = item.yearLow ? roundTo(item.yearLow, 2) : null;
  const high52 = item.yearHigh ? roundTo(item.yearHigh, 2) : null;
  const effectivePrice = afterPrice ?? regularPrice;
  return {
    previousClose,
    regularChange: item.change !== undefined ? roundTo(item.change, 2) : regDelta.change,
    regularChangePct:
      item.changePercentage !== undefined ? roundTo(item.changePercentage, 2) : regDelta.changePct,
    preMarketPrice: isPre ? afterPrice : null,
    preMarketChange: isPre ? extDelta.change : null,
    preMarketChangePct: isPre ? extDelta.changePct : null,
    postMarketPrice: isPre ? null : afterPrice,
    postMarketChange: isPre ? null : extDelta.change,
    postMarketChangePct: isPre ? null : extDelta.changePct,
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
  sessionHint: "PRE" | "REGULAR" | "POST" | "CLOSED",
  latencyMs: number,
): MarketSnapshotResult {
  if (!item.price) {
    return { ok: false, ticker, source: "fmp", reason: "FMP 未返回有效股价" };
  }
  const regularPrice = roundTo(item.price, 2);
  const isPre = afterPrice !== null && sessionHint === "PRE";
  const sessionState = afterPrice !== null ? (isPre ? "PRE" : "POST") : "REGULAR";
  return {
    ok: true,
    quote: {
      ticker,
      companyName: item.name?.trim() || undefined,
      exchange: item.exchange?.trim() || undefined,
      currency: "USD",
      sessionState,
      regularPrice,
      ...buildFmpExtended(item, regularPrice, afterPrice, isPre),
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
    const sessionHint = getUsEasternSession();
    try {
      const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(token)}`;
      const fetchExtended = sessionHint !== "REGULAR" || fetchImpl !== fetch;
      const [res, afterPrice] = await Promise.all([
        fetchImpl(url, { signal: AbortSignal.timeout(4500) }),
        fetchExtended ? tryFmpAftermarket(ticker, token, fetchImpl) : Promise.resolve(null),
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
      return buildFmpSnapshot(
        ticker,
        first,
        resolveFreshAftermarket(first.timestamp, afterPrice),
        sessionHint,
        latencyMs,
      );
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
