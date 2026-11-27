import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDailyPriceBars, fetchPolygonSplits } from "./daily-bars";
import { finnhubAdapter } from "./finnhub-adapter";
import { fmpAdapter } from "./fmp-adapter";
import { polygonAdapter } from "./polygon-adapter";
import {
  clearMarketQuoteCache,
  fetchMarketQuote,
  testMarketProviderConnection,
} from "./provider-registry";
import { yahooFinanceAdapter } from "./yahoo-adapter";

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("KANON Multi-Provider Market Data Engine", () => {
  beforeEach(() => {
    clearMarketQuoteCache();
  });

  it("extracts live pre-market, regular, post-market, and 52W telemetry from Yahoo v8 chart", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const fakeFetch: typeof fetch = async () =>
      mockJsonResponse({
        chart: {
          result: [
            {
              meta: {
                currency: "USD",
                exchangeName: "NMS",
                shortName: "NVIDIA Corporation",
                regularMarketPrice: 165.05,
                chartPreviousClose: 160.0,
                regularMarketChangePercent: 3.16,
                regularMarketDayHigh: 168.0,
                regularMarketDayLow: 159.5,
                fiftyTwoWeekHigh: 200.0,
                fiftyTwoWeekLow: 100.0,
                regularMarketVolume: 51200000,
                regularMarketTime: nowSec,
                currentTradingPeriod: {
                  pre: { start: nowSec - 1800, end: nowSec + 1800 },
                  regular: { start: nowSec + 1800, end: nowSec + 25000 },
                  post: { start: nowSec + 25000, end: nowSec + 39000 },
                },
              },
              timestamp: [nowSec - 600, nowSec - 60],
              indicators: { quote: [{ close: [169.1, 170.0] }] },
            },
          ],
        },
      });

    const res = await yahooFinanceAdapter.fetchQuote("NVDA", undefined, fakeFetch);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.quote.sessionState).toBe("PRE");
    expect(res.quote.regularPrice).toBe(165.05);
    expect(res.quote.preMarketPrice).toBe(170);
    expect(res.quote.effectivePrice).toBe(170);
    expect(res.quote.preMarketChangePct).toBe(3);
    expect(res.quote.fiftyTwoWeekPositionPct).toBe(70);
    expect(res.quote.tier).toBe("free");
  });

  it("parses Finnhub, FMP aftermarket, and Polygon snapshots accurately", async () => {
    const fhFetch: typeof fetch = async () =>
      mockJsonResponse({ c: 142.5, d: 2.5, dp: 1.79, h: 144, l: 139, pc: 140, t: 1730000000 });
    const fh = await finnhubAdapter.fetchQuote("NVDA", "demo-key", fhFetch);
    expect(fh.ok).toBe(true);
    if (fh.ok) expect(fh.quote.regularPrice).toBe(142.5);

    const fmpFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("aftermarket-trade")) return mockJsonResponse([{ price: 145.0 }]);
      return mockJsonResponse([
        {
          name: "NVIDIA",
          price: 142.0,
          previousClose: 140.0,
          yearHigh: 160,
          yearLow: 100,
        },
      ]);
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T22:00:00Z"));
    try {
      const fmp = await fmpAdapter.fetchQuote("NVDA", "fmp-key", fmpFetch);
      expect(fmp.ok).toBe(true);
      if (fmp.ok) {
        expect(fmp.quote.postMarketPrice).toBe(145);
        expect(fmp.quote.sessionState).toBe("POST");
        expect(fmp.quote.effectivePrice).toBe(145);
      }
    } finally {
      vi.useRealTimers();
    }

    const polyFetch: typeof fetch = async () =>
      mockJsonResponse({
        ticker: {
          todaysChange: 4.2,
          todaysChangePerc: 2.8,
          day: { c: 150.0, h: 152, l: 147, v: 30000000 },
          prevDay: { c: 145.8 },
          lastTrade: { p: 153.2 },
        },
      });
    const poly = await polygonAdapter.fetchQuote("NVDA", "poly-key", polyFetch);
    expect(poly.ok).toBe(true);
    if (poly.ok) {
      expect(poly.quote.regularPrice).toBe(150);
      expect(poly.quote.postMarketPrice).toBe(153.2);
      expect(poly.quote.tier).toBe("paid");
    }
  });

  it("falls back automatically from failing paid provider to Free Yahoo Extended-Hours", async () => {
    const fallbackFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("polygon.io")) return mockJsonResponse({ error: "unauthorized" }, 401);
      return mockJsonResponse({
        chart: {
          result: [{ meta: { regularMarketPrice: 112.4, chartPreviousClose: 110.0 } }],
        },
      });
    };

    const res = await fetchMarketQuote("MU", {
      creds: { provider: "polygon", apiKey: "bad-key" },
      fetchImpl: fallbackFetch,
      bypassCache: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.quote.source).toBe("yahoo");
      expect(res.quote.regularPrice).toBe(112.4);
    }

    const testRes = await testMarketProviderConnection({
      provider: "yahoo",
      ticker: "MU",
      fetchImpl: fallbackFetch,
    });
    expect(testRes.ok).toBe(true);
    expect(testRes.provider).toBe("yahoo");
  });

  it("L1: sends Polygon Bearer Authorization header (never query apiKey) for daily bars and splits", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const spyFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      seen.push({ url, auth: headers.get("authorization") });
      if (url.includes("/v3/reference/splits")) {
        return mockJsonResponse({
          results: [{ execution_date: "2024-06-10", split_from: 1, split_to: 10 }],
        });
      }
      return mockJsonResponse({
        results: [{ t: 1717977600000, o: 120, h: 122, l: 119, c: 121, v: 50_000_000 }],
      });
    };
    const [bars, splits] = await Promise.all([
      fetchDailyPriceBars({
        ticker: "NVDA",
        creds: { provider: "polygon", apiKey: "secret-poly-token" },
        fetchImpl: spyFetch,
      }),
      fetchPolygonSplits({
        ticker: "NVDA",
        apiKey: "secret-poly-token",
        fetchImpl: spyFetch,
      }),
    ]);
    expect(bars.length).toBeGreaterThanOrEqual(1);
    expect(splits).toEqual([{ exDate: "2024-06-10", ratio: 10 }]);
    expect(seen.every((s) => !s.url.includes("apiKey="))).toBe(true);
    expect(seen.every((s) => s.auth === "Bearer secret-poly-token")).toBe(true);
  });
});
