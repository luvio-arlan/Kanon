import { fetchMarketQuotes } from "@kanon/ai";
import {
  type MarketDataSource,
  type MarketQuoteSnapshot,
  MarketQuotesResponseSchema,
} from "@kanon/core";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonError, jsonOk } from "../../_lib/http";
import { parseMarketHeaders } from "../../_lib/market-headers";

export const dynamic = "force-dynamic";

function parseTickerList(raw: string | null): string[] {
  if (!raw) return [];
  const items = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9.-]{1,10}$/.test(s));
  return [...new Set(items)].slice(0, 24);
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const tickers = parseTickerList(url.searchParams.get("tickers"));
  if (tickers.length === 0) {
    return jsonError("请提供有效的美股代码列表（如 tickers=NVDA,MU）。", 400, startedAt, "INVALID");
  }
  const bypassCache = url.searchParams.get("refresh") === "1";
  const map = await fetchMarketQuotes(tickers, {
    creds: parseMarketHeaders(request),
    bypassCache,
  });

  const quotes: Record<string, MarketQuoteSnapshot> = {};
  const missingTickers: string[] = [];
  let activeSource: MarketDataSource | "none" = "none";

  for (const ticker of tickers) {
    const res = map.get(ticker);
    if (res?.ok) {
      quotes[ticker] = res.quote;
      if (activeSource === "none") activeSource = res.quote.source;
    } else {
      missingTickers.push(ticker);
    }
  }

  return jsonOk(
    MarketQuotesResponseSchema.parse({
      quotes,
      missingTickers,
      activeSource,
      fetchedAt: new Date().toISOString(),
    }),
    startedAt,
  );
}
