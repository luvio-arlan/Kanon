import { roundTo } from "@kanon/core";
import { z } from "zod";

export type MarketQuoteSource = "fmp" | "yahoo";

export type MarketQuoteResult =
  | { ok: true; ticker: string; price: number; companyName?: string; source: MarketQuoteSource }
  | { ok: false; ticker: string; reason: string };

const CACHE_TTL_MS = 15 * 60 * 1000;
const quoteCache = new Map<string, { expiresAt: number; result: MarketQuoteResult }>();

const FmpQuoteItemSchema = z.object({
  price: z.number().finite().positive().optional(),
  name: z.string().optional(),
});

const YahooChartSchema = z.object({
  chart: z
    .object({
      result: z
        .array(
          z.object({
            meta: z
              .object({
                regularMarketPrice: z.number().finite().positive().optional(),
                chartPreviousClose: z.number().finite().positive().optional(),
                shortName: z.string().optional(),
                longName: z.string().optional(),
              })
              .optional(),
          }),
        )
        .nullable()
        .optional(),
    })
    .optional(),
});

async function tryFmpQuote(
  ticker: string,
  fetchImpl: typeof fetch,
): Promise<MarketQuoteResult | null> {
  const apiKey = process.env.FMP_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    const parsed = z.array(FmpQuoteItemSchema).safeParse(await res.json());
    const first = parsed.success ? parsed.data[0] : undefined;
    if (!first?.price) return null;
    return {
      ok: true,
      ticker,
      price: roundTo(first.price, 2),
      companyName: first.name?.trim() || undefined,
      source: "fmp",
    };
  } catch (err) {
    void err;
    return null;
  }
}

async function tryYahooQuote(ticker: string, fetchImpl: typeof fetch): Promise<MarketQuoteResult> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`;
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "KANON-Research-OS/4.0" },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) {
      return { ok: false, ticker, reason: `收盘价接口返回 ${res.status}` };
    }
    const parsed = YahooChartSchema.safeParse(await res.json());
    const meta = parsed.success ? parsed.data.chart?.result?.[0]?.meta : undefined;
    const price = meta?.regularMarketPrice ?? meta?.chartPreviousClose;
    if (!price) {
      return { ok: false, ticker, reason: "未找到该代码对应的有效收盘价" };
    }
    return {
      ok: true,
      ticker,
      price: roundTo(price, 2),
      companyName: meta?.shortName?.trim() || meta?.longName?.trim() || undefined,
      source: "yahoo",
    };
  } catch (err) {
    return {
      ok: false,
      ticker,
      reason: err instanceof Error ? err.message.slice(0, 60) : "行情接口超时",
    };
  }
}

export async function fetchMarketClosingQuote(
  rawTicker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketQuoteResult> {
  const ticker = rawTicker.trim().toUpperCase();
  const cached = quoteCache.get(ticker);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }
  const fmp = await tryFmpQuote(ticker, fetchImpl);
  const result = fmp ?? (await tryYahooQuote(ticker, fetchImpl));
  if (result.ok) {
    quoteCache.set(ticker, { expiresAt: Date.now() + CACHE_TTL_MS, result });
  }
  return result;
}

export async function fetchMarketClosingQuotes(
  tickers: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, MarketQuoteResult>> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const entries = await Promise.all(
    unique.map(
      async (ticker) => [ticker, await fetchMarketClosingQuote(ticker, fetchImpl)] as const,
    ),
  );
  return new Map(entries);
}
