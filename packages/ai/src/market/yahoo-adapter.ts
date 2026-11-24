import { type MarketSessionState, roundTo, type SparklinePoint } from "@kanon/core";
import { z } from "zod";
import {
  computePriceDelta,
  computeRangePositionPct,
  type MarketDataAdapter,
  type MarketSnapshotResult,
  resolveEffectivePrice,
} from "./types";

const TradingWindowSchema = z.object({ start: z.number(), end: z.number() });

const YahooMetaSchema = z.object({
  currency: z.string().optional(),
  exchangeName: z.string().optional(),
  shortName: z.string().optional(),
  longName: z.string().optional(),
  regularMarketPrice: z.number().finite().positive().optional(),
  chartPreviousClose: z.number().finite().positive().optional(),
  regularMarketChangePercent: z.number().finite().optional(),
  regularMarketDayHigh: z.number().finite().positive().optional(),
  regularMarketDayLow: z.number().finite().positive().optional(),
  fiftyTwoWeekHigh: z.number().finite().positive().optional(),
  fiftyTwoWeekLow: z.number().finite().positive().optional(),
  regularMarketVolume: z.number().finite().nonnegative().optional(),
  regularMarketTime: z.number().optional(),
  currentTradingPeriod: z
    .object({
      pre: TradingWindowSchema.optional(),
      regular: TradingWindowSchema.optional(),
      post: TradingWindowSchema.optional(),
    })
    .optional(),
});

const YahooChartSchema = z.object({
  chart: z
    .object({
      result: z
        .array(
          z.object({
            meta: YahooMetaSchema.optional(),
            timestamp: z.array(z.number()).optional(),
            indicators: z
              .object({
                quote: z
                  .array(z.object({ close: z.array(z.number().nullable()).optional() }))
                  .optional(),
              })
              .optional(),
          }),
        )
        .nullable()
        .optional(),
    })
    .optional(),
});

type YahooMeta = z.infer<typeof YahooMetaSchema>;

function resolveYahooSession(
  period: YahooMeta["currentTradingPeriod"],
  nowSec: number,
): MarketSessionState {
  if (!period) return "CLOSED";
  if (period.regular && nowSec >= period.regular.start && nowSec < period.regular.end) {
    return "REGULAR";
  }
  if (period.pre && nowSec >= period.pre.start && nowSec < period.pre.end) return "PRE";
  if (period.post && nowSec >= period.post.start && nowSec < period.post.end) return "POST";
  return "CLOSED";
}

function findWindowPrice(
  timestamps: readonly number[],
  closes: readonly (number | null)[],
  window: { start: number; end: number } | undefined,
): number | null {
  if (!window) return null;
  for (let i = timestamps.length - 1; i >= 0; i -= 1) {
    const ts = timestamps[i];
    const p = closes[i];
    if (typeof ts === "number" && ts >= window.start && ts <= window.end && p && p > 0) {
      return roundTo(p, 2);
    }
  }
  return null;
}

function buildExtendedMetrics(
  meta: YahooMeta,
  timestamps: readonly number[],
  closes: readonly (number | null)[],
  regularPrice: number,
  nowSec: number,
) {
  const sessionState = resolveYahooSession(meta.currentTradingPeriod, nowSec);
  const preMarketPrice = findWindowPrice(timestamps, closes, meta.currentTradingPeriod?.pre);
  const postMarketPrice = findWindowPrice(timestamps, closes, meta.currentTradingPeriod?.post);
  const preDelta = computePriceDelta(preMarketPrice, regularPrice);
  const postDelta = computePriceDelta(postMarketPrice, regularPrice);
  const effectivePrice = resolveEffectivePrice({
    sessionState,
    regularPrice,
    preMarketPrice,
    postMarketPrice,
  });
  return {
    sessionState,
    preMarketPrice,
    preMarketChange: preDelta.change,
    preMarketChangePct: preDelta.changePct,
    postMarketPrice,
    postMarketChange: postDelta.change,
    postMarketChangePct: postDelta.changePct,
    effectivePrice,
  };
}

function roundOpt(v: number | undefined): number | null {
  return v !== undefined ? roundTo(v, 2) : null;
}

function buildYahooSnapshot(params: {
  ticker: string;
  meta: YahooMeta;
  timestamps: readonly number[];
  closes: readonly (number | null)[];
  latencyMs: number;
  nowSec: number;
}): MarketSnapshotResult {
  const { ticker, meta, timestamps, closes, latencyMs, nowSec } = params;
  const rawRegular = meta.regularMarketPrice ?? meta.chartPreviousClose;
  if (!rawRegular) {
    return { ok: false, ticker, source: "yahoo", reason: "未找到该代码对应的有效报价" };
  }
  const regularPrice = roundTo(rawRegular, 2);
  const previousClose = roundOpt(meta.chartPreviousClose);
  const regDelta = computePriceDelta(regularPrice, previousClose);
  const ext = buildExtendedMetrics(meta, timestamps, closes, regularPrice, nowSec);
  const low52 = roundOpt(meta.fiftyTwoWeekLow);
  const high52 = roundOpt(meta.fiftyTwoWeekHigh);
  return {
    ok: true,
    quote: {
      ticker,
      companyName: meta.shortName?.trim() || meta.longName?.trim() || undefined,
      exchange: meta.exchangeName?.trim() || undefined,
      currency: meta.currency?.trim() || "USD",
      regularPrice,
      previousClose,
      regularChange: regDelta.change,
      regularChangePct: roundOpt(meta.regularMarketChangePercent) ?? regDelta.changePct,
      ...ext,
      dayHigh: roundOpt(meta.regularMarketDayHigh),
      dayLow: roundOpt(meta.regularMarketDayLow),
      fiftyTwoWeekHigh: high52,
      fiftyTwoWeekLow: low52,
      fiftyTwoWeekPositionPct: computeRangePositionPct(ext.effectivePrice, low52, high52),
      volume: meta.regularMarketVolume ?? null,
      source: "yahoo",
      tier: "free",
      asOf: new Date((meta.regularMarketTime ?? nowSec) * 1000).toISOString(),
      latencyMs,
    },
  };
}

export const yahooFinanceAdapter: MarketDataAdapter = {
  id: "yahoo",
  tier: "free",
  supportsExtendedHours: true,
  async fetchQuote(ticker, _apiKey, fetchImpl) {
    const started = performance.now();
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m&includePrePost=true`;
      const res = await fetchImpl(url, {
        headers: { "User-Agent": "Mozilla/5.0 KANON-Research-OS/5.0" },
        signal: AbortSignal.timeout(5500),
      });
      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      if (!res.ok) {
        return { ok: false, ticker, source: "yahoo", reason: `Yahoo 行情接口返回 ${res.status}` };
      }
      const parsed = YahooChartSchema.safeParse(await res.json());
      const entry = parsed.success ? parsed.data.chart?.result?.[0] : undefined;
      if (!entry?.meta) {
        return { ok: false, ticker, source: "yahoo", reason: "Yahoo 返回结构缺失行情元数据" };
      }
      return buildYahooSnapshot({
        ticker,
        meta: entry.meta,
        timestamps: entry.timestamp ?? [],
        closes: entry.indicators?.quote?.[0]?.close ?? [],
        latencyMs,
        nowSec: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      return {
        ok: false,
        ticker,
        source: "yahoo",
        reason: err instanceof Error ? err.message.slice(0, 64) : "Yahoo 行情请求超时",
      };
    }
  },
};

function formatMonthLabel(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  return `${String(d.getUTCFullYear()).slice(-2)}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function fetchYahooSparkline(
  rawTicker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SparklinePoint[]> {
  const ticker = rawTicker.trim().toUpperCase();
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=6mo&interval=1mo`;
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "Mozilla/5.0 KANON-Research-OS/5.0" },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return [];
    const parsed = YahooChartSchema.safeParse(await res.json());
    const entry = parsed.success ? parsed.data.chart?.result?.[0] : undefined;
    const timestamps = entry?.timestamp ?? [];
    const closes = entry?.indicators?.quote?.[0]?.close ?? [];
    const points: SparklinePoint[] = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const ts = timestamps[i];
      const close = closes[i];
      if (typeof ts === "number" && typeof close === "number" && close > 0) {
        points.push({ label: formatMonthLabel(ts), price: roundTo(close, 2) });
      }
    }
    return points.slice(-6);
  } catch (err) {
    void err;
    return [];
  }
}
