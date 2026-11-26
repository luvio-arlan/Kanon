import { describe, expect, it } from "vitest";
import { fetchDailyPriceBars } from "../market/daily-bars";
import { classifyForm8kItems, parseForm8kItemCodes } from "./form8k-parser";

describe("Form 8-K red-flag parser & daily bars fetcher (W1.3 & W1.6)", () => {
  it("parses and prioritizes Item 4.02/4.01/5.02/2.02 alerts", () => {
    const codes = parseForm8kItemCodes(["Item 2.02", "Item 5.02, Item 4.02"]);
    expect(codes).toEqual(["2.02", "5.02", "4.02"]);
    const alerts = classifyForm8kItems(codes);
    expect(alerts[0]?.itemCode).toBe("4.02");
    expect(alerts[0]?.severity).toBe("critical");
    expect(alerts[1]?.itemCode).toBe("5.02");
    expect(alerts[1]?.severity).toBe("warn");
    expect(alerts[2]?.itemCode).toBe("2.02");
  });

  it("parses Polygon daily adjusted OHLCV bars cleanly without fabricating on failure", async () => {
    const okFetch = (async () =>
      new Response(
        JSON.stringify({
          results: [
            { t: Date.UTC(2025, 0, 2), o: 100, h: 105, l: 99, c: 104, v: 1_500_000 },
            { t: Date.UTC(2025, 0, 3), o: 104, h: 108, l: 103, c: 107, v: 1_800_000 },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const bars = await fetchDailyPriceBars({
      ticker: "MSFT",
      creds: { provider: "polygon", apiKey: "test-key" },
      fetchImpl: okFetch,
    });
    expect(bars).toHaveLength(2);
    expect(bars[0]?.barDate).toBe("2025-01-02");
    expect(bars[1]?.adjClose).toBe(107);
    expect(bars[0]?.source).toBe("polygon");

    const failFetch = (async () => new Response("err", { status: 503 })) as unknown as typeof fetch;
    const empty = await fetchDailyPriceBars({ ticker: "MSFT", fetchImpl: failFetch });
    expect(empty).toEqual([]);
  });
});
