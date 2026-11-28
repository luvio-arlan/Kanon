import { describe, expect, it } from "vitest";
import { clearMarketQuoteCache, fetchMarketQuote } from "./provider-registry";

describe("U1-3 · Market Provider Routing & Licensing (No Silent Fallback to Yahoo)", () => {
  it("fails closed when explicit Polygon provider returns 403 and NEVER falls back to Yahoo", async () => {
    clearMarketQuoteCache();
    const calledUrls: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calledUrls.push(url);
      return new Response("Forbidden", { status: 403 });
    };
    const res = await fetchMarketQuote("NVDA", {
      creds: { provider: "polygon", apiKey: "test-key" },
      fetchImpl: fakeFetch,
      bypassCache: true,
    });
    expect(res.ok).toBe(false);
    expect(calledUrls.length).toBeGreaterThan(0);
    expect(calledUrls.some((u) => u.includes("yahoo"))).toBe(false);
  });
});
