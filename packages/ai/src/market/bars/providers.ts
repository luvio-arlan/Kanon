import { z } from "zod";

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

export interface PolygonSplitEvent {
  exDate: string;
  ratio: number;
  source?: "polygon" | "yahoo";
}

export interface DividendEvent {
  exDate: string;
  amount: number;
  source: "yahoo" | "polygon";
}

export interface DailyPriceBarsBundle {
  bars: DailyBarPoint[];
  splits: PolygonSplitEvent[];
  dividends: DividendEvent[];
  dividendAdjusted: boolean;
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
            events: z
              .object({
                splits: z
                  .record(
                    z.string(),
                    z.object({ date: z.number(), numerator: z.number(), denominator: z.number() }),
                  )
                  .optional(),
                dividends: z
                  .record(z.string(), z.object({ date: z.number(), amount: z.number() }))
                  .optional(),
              })
              .optional(),
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

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function fetchPolygonDailyBars(
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

export async function fetchPolygonSplitsRaw(
  ticker: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<PolygonSplitEvent[]> {
  const url = `https://api.polygon.io/v3/reference/splits?ticker=${encodeURIComponent(ticker)}&limit=50`;
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
type YahooChartResult = NonNullable<
  NonNullable<z.infer<typeof YahooChartResponseSchema>["chart"]>["result"]
>[number];

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

function extractYahooEvents(result: YahooChartResult | undefined): {
  splits: PolygonSplitEvent[];
  dividends: DividendEvent[];
} {
  const splits = Object.values(result?.events?.splits ?? {})
    .filter((sp) => sp.denominator > 0 && sp.numerator > 0)
    .map((sp) => ({
      exDate: toIsoDate(sp.date * 1000),
      ratio: sp.numerator / sp.denominator,
      source: "yahoo" as const,
    }));
  const dividends = Object.values(result?.events?.dividends ?? {})
    .filter((div) => Number.isFinite(div.amount) && div.amount > 0)
    .map((div) => ({
      exDate: toIsoDate(div.date * 1000),
      amount: div.amount,
      source: "yahoo" as const,
    }));
  return { splits, dividends };
}

export async function fetchYahooDailyBundle(
  ticker: string,
  range: "1mo" | "1y" | "5y",
  fetchImpl: typeof fetch,
): Promise<DailyPriceBarsBundle | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d&events=split%7Cdiv`;
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
  const { splits, dividends } = extractYahooEvents(result);
  return bars.length > 0 ? { bars, splits, dividends, dividendAdjusted: true } : null;
}
