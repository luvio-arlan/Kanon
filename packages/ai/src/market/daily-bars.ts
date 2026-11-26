import { z } from "zod";
import type { MarketAdapterCredentials } from "./types";

export interface DailyBarPoint {
  barDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number | null;
  source: "polygon" | "fmp" | "yahoo";
}

const PolygonAggResponseSchema = z.object({
  results: z
    .array(
      z.object({
        t: z.number().optional(),
        o: z.number().optional(),
        h: z.number().optional(),
        l: z.number().optional(),
        c: z.number().optional(),
        v: z.number().optional(),
      }),
    )
    .optional(),
});

const YahooChartQuoteSchema = z.object({
  open: z.array(z.number().nullable()).optional(),
  high: z.array(z.number().nullable()).optional(),
  low: z.array(z.number().nullable()).optional(),
  close: z.array(z.number().nullable()).optional(),
  volume: z.array(z.number().nullable()).optional(),
});

const YahooChartResponseSchema = z.object({
  chart: z
    .object({
      result: z
        .array(
          z.object({
            timestamp: z.array(z.number()).optional(),
            indicators: z
              .object({
                quote: z.array(YahooChartQuoteSchema).optional(),
                adjclose: z
                  .array(z.object({ adjclose: z.array(z.number().nullable()).optional() }))
                  .optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface PolygonSplitEvent {
  exDate: string;
  ratio: number;
}

const PolygonSplitsResponseSchema = z.object({
  results: z
    .array(
      z.object({
        execution_date: z.string().optional(),
        split_from: z.number().optional(),
        split_to: z.number().optional(),
      }),
    )
    .optional(),
});

async function fetchPolygonDailyBars(
  ticker: string,
  fromDate: string,
  toDate: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<DailyBarPoint[] | null> {
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=5000`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const parsed = PolygonAggResponseSchema.safeParse(await res.json());
  if (!parsed.success) return null;
  const bars: DailyBarPoint[] = [];
  for (const row of parsed.data.results ?? []) {
    if (!row.t || !row.c || row.c <= 0) continue;
    bars.push({
      barDate: toIsoDate(row.t),
      open: row.o ?? row.c,
      high: row.h ?? row.c,
      low: row.l ?? row.c,
      close: row.c,
      adjClose: row.c,
      volume: row.v ?? null,
      source: "polygon",
    });
  }
  return bars.length > 0 ? bars : null;
}

/** Fetches historical stock split events from Polygon using Bearer authentication. */
export async function fetchPolygonSplits(params: {
  ticker: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<PolygonSplitEvent[]> {
  const token = params.apiKey?.trim() || process.env.POLYGON_API_KEY?.trim();
  if (!token) return [];
  const fetchImpl = params.fetchImpl ?? fetch;
  const url = `https://api.polygon.io/v3/reference/splits?ticker=${encodeURIComponent(params.ticker.trim().toUpperCase())}&limit=50`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return [];
  const parsed = PolygonSplitsResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return [];
  const out: PolygonSplitEvent[] = [];
  for (const row of parsed.data.results ?? []) {
    if (
      row.execution_date &&
      row.split_from &&
      row.split_to &&
      row.split_from > 0 &&
      row.split_to > 0
    ) {
      out.push({ exDate: row.execution_date, ratio: row.split_to / row.split_from });
    }
  }
  return out;
}

type YahooChartQuote = z.infer<typeof YahooChartQuoteSchema>;

function parseYahooBarRow(
  ts: number | undefined,
  idx: number,
  quote: YahooChartQuote | undefined,
  adjArr: (number | null)[] | undefined,
): DailyBarPoint | null {
  const close = quote?.close?.[idx];
  if (!ts || typeof close !== "number" || !Number.isFinite(close) || close <= 0) return null;
  const adjClose = adjArr?.[idx];
  return {
    barDate: toIsoDate(ts * 1000),
    open: quote?.open?.[idx] ?? close,
    high: quote?.high?.[idx] ?? close,
    low: quote?.low?.[idx] ?? close,
    close,
    adjClose: typeof adjClose === "number" && adjClose > 0 ? adjClose : close,
    volume: quote?.volume?.[idx] ?? null,
    source: "yahoo",
  };
}

async function fetchYahooDailyBars(
  ticker: string,
  range: "1y" | "5y",
  fetchImpl: typeof fetch,
): Promise<DailyBarPoint[] | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const parsed = YahooChartResponseSchema.safeParse(await res.json());
  if (!parsed.success) return null;
  const result = parsed.data.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const adjArr = result?.indicators?.adjclose?.[0]?.adjclose;
  const bars: DailyBarPoint[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const bar = parseYahooBarRow(timestamps[i], i, quote, adjArr);
    if (bar) bars.push(bar);
  }
  return bars.length > 0 ? bars : null;
}

/**
 * Fetches split/dividend-adjusted daily OHLCV bars from Polygon (if configured) or Yahoo Finance.
 * Never fabricates synthetic bars when upstream fails.
 */
export async function fetchDailyPriceBars(params: {
  ticker: string;
  range?: "1y" | "5y";
  creds?: MarketAdapterCredentials;
  fetchImpl?: typeof fetch;
}): Promise<DailyBarPoint[]> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const ticker = params.ticker.trim().toUpperCase();
  const range = params.range ?? "5y";
  const polygonKey =
    (params.creds?.provider === "polygon" ? params.creds.apiKey?.trim() : undefined) ||
    process.env.POLYGON_API_KEY?.trim();
  if (polygonKey) {
    const toDate = new Date().toISOString().slice(0, 10);
    const years = range === "5y" ? 5 : 1;
    const from = new Date(Date.now() - years * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const poly = await fetchPolygonDailyBars(ticker, from, toDate, polygonKey, fetchImpl).catch(
      () => null,
    );
    if (poly) return poly;
  }
  const yahoo = await fetchYahooDailyBars(ticker, range, fetchImpl).catch(() => null);
  return yahoo ?? [];
}
