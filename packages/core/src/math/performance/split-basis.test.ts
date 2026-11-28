import { describe, expect, it } from "vitest";
import { buildPortfolioPerformanceSeries, replayLedgerTransactions } from "./index";
import { computeSplitBasisFactor } from "./split-basis";

function buildRandomSplitPrices(
  dates: readonly string[],
  splits: ReadonlyArray<{ exDate: string; ratio: number }>,
) {
  let seed = 4219;
  const rawPrices: number[] = [];
  let p = 1000;
  for (const d of dates) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const sp = splits.find((s) => s.exDate === d);
    if (sp) p /= sp.ratio;
    p *= 0.98 + (seed / 2 ** 32) * 0.04;
    rawPrices.push(p);
  }
  const basisBars = dates.map((d, i) => ({
    barDate: d,
    close: (rawPrices[i] ?? 1) / computeSplitBasisFactor(d, splits),
  }));
  return { rawPrices, basisBars };
}

function computeGroundTruthSeries(
  dates: readonly string[],
  splits: ReadonlyArray<{ exDate: string; ratio: number }>,
  rawPrices: readonly number[],
  cashInit: number,
): number[] {
  let shares = 0;
  let cash = cashInit;
  return dates.map((d, i) => {
    const sp = splits.find((s) => s.exDate === d);
    if (sp) shares *= sp.ratio;
    if (i === 0) {
      shares += 5;
      cash -= 5 * (rawPrices[0] ?? 1000);
    }
    if (i === 12) {
      shares += 3;
      cash -= 3 * (rawPrices[12] ?? 250);
    }
    return Math.round((cash + shares * (rawPrices[i] ?? 0)) * 100) / 100;
  });
}

describe("U0-5 Split-Basis NAV Ground Truth (G23) & Same-Day Settlement (U0-11)", () => {
  it("matches exact ground-truth NAV for NVDA 10:1 pre-split purchase with zero false drawdown", () => {
    // Deposit $8,600 -> Buy 10 NVDA @ $860 on 2024-05-01 -> 10:1 split on 2024-06-10
    // Stored Yahoo/Polygon bars are retrospectively split-adjusted: $86 on 2024-05-01, $120 on 2024-06-10
    const splits = new Map([["NVDA", [{ exDate: "2024-06-10", ratio: 10 }]]]);
    const bars = new Map([
      [
        "NVDA",
        [
          { barDate: "2024-05-01", close: 86 },
          { barDate: "2024-05-15", close: 94 },
          { barDate: "2024-06-07", close: 120.88 },
          { barDate: "2024-06-10", close: 121.79 },
        ],
      ],
    ]);
    const perf = buildPortfolioPerformanceSeries({
      accountId: "acc-nvda",
      transactions: [
        {
          id: "dep",
          ticker: "CASH",
          action: "deposit",
          quantity: 8600,
          price: 1,
          fees: 0,
          tradeDate: "2024-05-01",
          createdAtMs: 1,
        },
        {
          id: "buy",
          ticker: "NVDA",
          action: "buy",
          quantity: 10,
          price: 860,
          fees: 0,
          tradeDate: "2024-05-01",
          createdAtMs: 2,
        },
      ],
      barsByTicker: bars,
      splitsByTicker: splits,
      dividendsByTicker: new Map(),
      spyBars: [
        { barDate: "2024-05-01", close: 500 },
        { barDate: "2024-06-10", close: 530 },
      ],
      spyDividends: [],
      asOfDate: "2024-06-10",
    });
    expect(perf.basis).toBe("full_bars");
    expect(perf.series[0]?.nav).toBeCloseTo(8600, 2);
    expect(perf.totalNav).toBeCloseTo(12179, 2);
    expect(perf.maxDrawdownPct).toBe(0);
    expect(perf.twrPct).toBeCloseTo(((12179 - 8600) / 8600) * 100, 1);
  });

  it("property test (G23): random unadjusted price path + random splits equals split-basis NAV", () => {
    const dates = Array.from({ length: 30 }, (_, i) => `2025-01-${String(i + 1).padStart(2, "0")}`);
    const splits = [
      { exDate: "2025-01-10", ratio: 4 },
      { exDate: "2025-01-22", ratio: 5 },
    ];
    const { rawPrices, basisBars } = buildRandomSplitPrices(dates, splits);
    const p0 = rawPrices[0] ?? 1000;
    const p12 = rawPrices[12] ?? 250;
    const perf = buildPortfolioPerformanceSeries({
      accountId: "acc-prop",
      transactions: [
        {
          id: "d0",
          ticker: "CASH",
          action: "deposit",
          quantity: 10_000,
          price: 1,
          fees: 0,
          tradeDate: dates[0] ?? "",
          createdAtMs: 1,
        },
        {
          id: "b0",
          ticker: "ACME",
          action: "buy",
          quantity: 5,
          price: p0,
          fees: 0,
          tradeDate: dates[0] ?? "",
          createdAtMs: 2,
        },
        {
          id: "b12",
          ticker: "ACME",
          action: "buy",
          quantity: 3,
          price: p12,
          fees: 0,
          tradeDate: dates[12] ?? "",
          createdAtMs: 3,
        },
      ],
      barsByTicker: new Map([["ACME", basisBars]]),
      splitsByTicker: new Map([["ACME", splits]]),
      dividendsByTicker: new Map(),
      spyBars: [],
      spyDividends: [],
      asOfDate: dates[dates.length - 1] ?? "",
    });
    const expected = computeGroundTruthSeries(dates, splits, rawPrices, 10_000);
    for (let i = 0; i < dates.length; i += 1) {
      expect(Math.abs((perf.series[i]?.nav ?? 0) - (expected[i] ?? 0))).toBeLessThanOrEqual(0.02);
    }
  });

  it("flags un-rebased bars with a 10x price cliff on split exDate as rebase_pending", () => {
    const perf = buildPortfolioPerformanceSeries({
      accountId: "acc-cliff",
      transactions: [
        {
          id: "d1",
          ticker: "CASH",
          action: "deposit",
          quantity: 10_000,
          price: 1,
          fees: 0,
          tradeDate: "2024-06-07",
          createdAtMs: 1,
        },
        {
          id: "b1",
          ticker: "NVDA",
          action: "buy",
          quantity: 10,
          price: 1000,
          fees: 0,
          tradeDate: "2024-06-07",
          createdAtMs: 2,
        },
      ],
      barsByTicker: new Map([
        [
          "NVDA",
          [
            { barDate: "2024-06-07", close: 1000 }, // un-rebased!
            { barDate: "2024-06-10", close: 100 },
          ],
        ],
      ]),
      splitsByTicker: new Map([["NVDA", [{ exDate: "2024-06-10", ratio: 10 }]]]),
      dividendsByTicker: new Map(),
      spyBars: [],
      spyDividends: [],
      asOfDate: "2024-06-10",
    });
    expect(perf.basis).toBe("rebase_pending");
    expect(perf.twrPct).toBeNull();
    expect(perf.maxDrawdownPct).toBeNull();
  });

  it("applies end-of-day settlement ordering on same day (sell proceeds fund same-day buy regardless of entry order)", () => {
    const replay = replayLedgerTransactions({
      transactions: [
        {
          id: "d1",
          ticker: "CASH",
          action: "deposit",
          quantity: 1000,
          price: 1,
          fees: 0,
          tradeDate: "2026-01-01",
          createdAtMs: 1,
        },
        {
          id: "b1",
          ticker: "AAA",
          action: "buy",
          quantity: 10,
          price: 100,
          fees: 0,
          tradeDate: "2026-01-01",
          createdAtMs: 2,
        },
        // User enters buy BBB BEFORE sell AAA on 2026-02-01 (cash is $0 before sell settles)
        {
          id: "b2",
          ticker: "BBB",
          action: "buy",
          quantity: 10,
          price: 100,
          fees: 0,
          tradeDate: "2026-02-01",
          createdAtMs: 10,
        },
        {
          id: "s1",
          ticker: "AAA",
          action: "sell",
          quantity: 10,
          price: 100,
          fees: 0,
          tradeDate: "2026-02-01",
          createdAtMs: 20,
        },
      ],
      splitsByTicker: new Map(),
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.cashBalance).toBe(0);
  });
});
