import { describe, expect, it } from "vitest";
import { accumulateDailyFxAttribution } from "./fx-attribution";
import { linkFxContributionCarino } from "./fx-contribution";
import { buildPortfolioPerformanceSeries } from "./index";
import { computeDailyTwr } from "./twr";

const HKD_RATES = new Map([
  [
    "HKD",
    [
      { rateDate: "2026-01-02", usdPerUnit: 0.128 },
      { rateDate: "2026-01-05", usdPerUnit: 0.13 },
      { rateDate: "2026-01-06", usdPerUnit: 0.125 },
    ],
  ],
]);

function hkTx(id: string, action: "deposit" | "buy", qty: number, price: number, date: string) {
  return {
    id,
    ticker: action === "deposit" ? "CASH" : "0700-HK",
    action,
    quantity: qty,
    price,
    fees: 0,
    tradeCurrency: action === "deposit" ? "USD" : "HKD",
    fxToBase: action === "deposit" ? 1 : 0.128,
    tradeDate: date,
    createdAtMs: id.length,
  };
}

describe("V1-3 · Carino-linked FX contribution and V0-3 FX-aware risk weights", () => {
  it("linked local + FX contributions add up to chained TWR exactly (multi-day, deposits mid-way)", () => {
    const points = [
      { date: "d0", nav: 1000, netFlow: 1000 },
      { date: "d1", nav: 1050, netFlow: 0 },
      { date: "d2", nav: 1600, netFlow: 500 },
      { date: "d3", nav: 1580, netFlow: 0 },
    ];
    const fx = [0, 20, -15, 10];
    const linked = linkFxContributionCarino(points, fx);
    const twr = computeDailyTwr(points).twrPct;
    expect(linked).not.toBeNull();
    expect((linked?.localPct ?? 0) + (linked?.fxPct ?? 0)).toBeCloseTo(twr ?? Number.NaN, 1);
  });

  it("shares bought today carry no overnight FX move; only shares held across the day do", () => {
    const prev = new Map([["X", { ticker: "X", shares: 10, localPrice: 100, fxToBase: 1 }]]);
    const curr = new Map([["X", { ticker: "X", shares: 30, localPrice: 100, fxToBase: 1.1 }]]);
    const flow = new Map([["X", 20 * 100 * 1.1]]);
    const res = accumulateDailyFxAttribution({
      prevByTicker: prev,
      currByTicker: curr,
      dayTradeFlowBaseByTicker: flow,
    });
    expect(res.fxDelta).toBeCloseTo(10 * 100 * 0.1, 9);
    expect(res.localDelta).toBeCloseTo(0, 9);
  });

  it("USD account holding 0700-HK reports TWR = local + FX", () => {
    const transactions = [
      hkTx("dep", "deposit", 10_000, 1, "2026-01-02"),
      hkTx("buy", "buy", 100, 400, "2026-01-02"),
    ];
    const barsByTicker = new Map([
      [
        "0700-HK",
        [
          { barDate: "2026-01-02", close: 400 },
          { barDate: "2026-01-05", close: 410 },
          { barDate: "2026-01-06", close: 420 },
        ],
      ],
    ]);
    const perf = buildPortfolioPerformanceSeries({
      accountId: "acct",
      baseCurrency: "USD",
      transactions,
      barsByTicker,
      splitsByTicker: new Map(),
      dividendsByTicker: new Map(),
      fxRatesByCurrency: HKD_RATES,
      spyBars: [],
      spyDividends: [],
      asOfDate: "2026-01-06",
    });
    expect(perf.status).toBe("ready");
    expect((perf.localContributionPct ?? 0) + (perf.fxContributionPct ?? 0)).toBeCloseTo(
      perf.twrPct ?? Number.NaN,
      1,
    );
  });
});
