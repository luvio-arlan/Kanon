import { type MarketSessionState, roundTo } from "@kanon/core";
import { z } from "zod";
import { computePriceDelta, type MarketDataAdapter, type MarketSnapshotResult } from "./types";

const PolygonSnapshotSchema = z.object({
  ticker: z
    .object({
      todaysChange: z.number().finite().optional(),
      todaysChangePerc: z.number().finite().optional(),
      updated: z.number().optional(),
      day: z
        .object({
          c: z.number().finite().nonnegative().optional(),
          h: z.number().finite().nonnegative().optional(),
          l: z.number().finite().nonnegative().optional(),
          v: z.number().finite().nonnegative().optional(),
        })
        .optional(),
      prevDay: z
        .object({
          c: z.number().finite().positive().optional(),
        })
        .optional(),
      min: z
        .object({
          c: z.number().finite().positive().optional(),
        })
        .optional(),
      lastTrade: z
        .object({
          p: z.number().finite().positive().optional(),
        })
        .optional(),
    })
    .optional(),
});

function inferPolygonSession(regularPrice: number, livePrice: number): MarketSessionState {
  if (Math.abs(livePrice - regularPrice) >= 0.01) return "POST";
  return "REGULAR";
}

function buildPolygonFields(
  snap: NonNullable<z.infer<typeof PolygonSnapshotSchema>["ticker"]>,
  regularPrice: number,
  effectivePrice: number,
) {
  const prevClose = snap.prevDay?.c ?? null;
  const regDelta = computePriceDelta(regularPrice, prevClose);
  const extPrice = Math.abs(effectivePrice - regularPrice) >= 0.01 ? effectivePrice : null;
  const extDelta = computePriceDelta(extPrice, regularPrice);
  return {
    previousClose: prevClose ? roundTo(prevClose, 2) : null,
    regularChange:
      snap.todaysChange !== undefined ? roundTo(snap.todaysChange, 2) : regDelta.change,
    regularChangePct:
      snap.todaysChangePerc !== undefined ? roundTo(snap.todaysChangePerc, 2) : regDelta.changePct,
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePct: null,
    postMarketPrice: extPrice,
    postMarketChange: extDelta.change,
    postMarketChangePct: extDelta.changePct,
  };
}

function buildPolygonSnapshot(
  ticker: string,
  snap: NonNullable<z.infer<typeof PolygonSnapshotSchema>["ticker"]>,
  latencyMs: number,
): MarketSnapshotResult {
  const dayClose = snap.day?.c && snap.day.c > 0 ? snap.day.c : null;
  const liveTrade = snap.lastTrade?.p ?? snap.min?.c ?? null;
  const rawRegular = dayClose ?? liveTrade ?? snap.prevDay?.c ?? null;
  if (!rawRegular) {
    return { ok: false, ticker, source: "polygon", reason: "Polygon 快照缺少有效成交价" };
  }
  const regularPrice = roundTo(rawRegular, 2);
  const effectivePrice = roundTo(liveTrade ?? regularPrice, 2);
  const asOfMs = snap.updated ? Math.floor(snap.updated / 1_000_000) : Date.now();
  return {
    ok: true,
    quote: {
      ticker,
      currency: "USD",
      sessionState: inferPolygonSession(regularPrice, effectivePrice),
      regularPrice,
      ...buildPolygonFields(snap, regularPrice, effectivePrice),
      effectivePrice,
      dayHigh: snap.day?.h && snap.day.h > 0 ? roundTo(snap.day.h, 2) : null,
      dayLow: snap.day?.l && snap.day.l > 0 ? roundTo(snap.day.l, 2) : null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      fiftyTwoWeekPositionPct: null,
      volume: snap.day?.v ?? null,
      source: "polygon",
      tier: "paid",
      asOf: new Date(asOfMs).toISOString(),
      latencyMs,
    },
  };
}

export const polygonAdapter: MarketDataAdapter = {
  id: "polygon",
  tier: "paid",
  supportsExtendedHours: true,
  async fetchQuote(ticker, apiKey, fetchImpl) {
    const token = apiKey?.trim() || process.env.POLYGON_API_KEY?.trim();
    if (!token) {
      return { ok: false, ticker, source: "polygon", reason: "未配置 Polygon.io API Key" };
    }
    const started = performance.now();
    try {
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}?apiKey=${encodeURIComponent(token)}`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(4500) });
      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      if (!res.ok) {
        return { ok: false, ticker, source: "polygon", reason: `Polygon 返回 ${res.status}` };
      }
      const parsed = PolygonSnapshotSchema.safeParse(await res.json());
      if (!parsed.success || !parsed.data.ticker) {
        return { ok: false, ticker, source: "polygon", reason: "Polygon 未匹配到该代码快照" };
      }
      return buildPolygonSnapshot(ticker, parsed.data.ticker, latencyMs);
    } catch (err) {
      return {
        ok: false,
        ticker,
        source: "polygon",
        reason: err instanceof Error ? err.message.slice(0, 64) : "Polygon 请求超时",
      };
    }
  },
};
