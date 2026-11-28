import { describe, expect, it } from "vitest";
import { buildPortfolioPerformanceSeries, replayLedgerTransactions } from "./index";

describe("U1-1 · Multi-Currency Ledger, FX Attribution & Transaction Reversal Goldens", () => {
  it("EUR account + NVDA: exact additive local + FX decomposition with EURUSD +5% (zero residual)", () => {
    // Day 1: EURUSD = 1.00 (1 EUR = 1 USD -> USD/EUR = 1.00). Deposit 1000 EUR, buy 10 NVDA @ $100 (fx=1.00).
    // Day 2: NVDA rises to $110 (+10%), EURUSD moves to 1.05 (1 EUR = 1.05 USD -> 1 USD = 1/1.05 EUR).
    // Expected local contribution = 10 * (110 - 100) * 1.00 = +100 EUR.
    // Expected FX contribution    = 10 * 110 * (1/1.05 - 1.00) = -52.380952... EUR.
    // Sum = 47.619047... EUR = ΔNAV - netFlow.
    const fxRatesByCurrency = new Map([
      [
        "EUR",
        [
          { rateDate: "2026-01-02", usdPerUnit: 1.0 },
          { rateDate: "2026-01-05", usdPerUnit: 1.05 },
        ],
      ],
    ]);
    const res = buildPortfolioPerformanceSeries({
      accountId: "acct-eur",
      baseCurrency: "EUR",
      transactions: [
        {
          id: "d1",
          ticker: "CASH",
          action: "deposit",
          quantity: 1000,
          price: 1,
          fees: 0,
          tradeCurrency: "EUR",
          fxToBase: 1,
          tradeDate: "2026-01-02",
          createdAtMs: 1,
        },
        {
          id: "b1",
          ticker: "NVDA",
          action: "buy",
          quantity: 10,
          price: 100,
          fees: 0,
          tradeCurrency: "USD",
          fxToBase: 1.0,
          tradeDate: "2026-01-02",
          createdAtMs: 2,
        },
      ],
      barsByTicker: new Map([
        [
          "NVDA",
          [
            { barDate: "2026-01-02", close: 100 },
            { barDate: "2026-01-05", close: 110 },
          ],
        ],
      ]),
      splitsByTicker: new Map(),
      dividendsByTicker: new Map(),
      fxRatesByCurrency,
      spyBars: [
        { barDate: "2026-01-02", close: 500 },
        { barDate: "2026-01-05", close: 500 },
      ],
      spyDividends: [],
      asOfDate: "2026-01-05",
    });
    expect(res.baseCurrency).toBe("EUR");
    expect(res.basis).toBe("full_bars");
    expect(res.localContribution).toBeCloseTo(100, 2);
    expect(res.fxContribution).toBeCloseTo(-52.38, 2);
    const totalPnl = (res.totalNav ?? 0) - 1000;
    expect((res.localContribution ?? 0) + (res.fxContribution ?? 0)).toBeCloseTo(totalPnl, 1);
    // SPY flat in USD -> in EUR dropped by (1/1.05 - 1) = -4.76%
    expect(res.spyTrPct).toBeCloseTo(-4.76, 2);
  });

  it("HKD account + 0700.HK: same-currency holding has zero FX contribution", () => {
    const res = buildPortfolioPerformanceSeries({
      accountId: "acct-hkd",
      baseCurrency: "HKD",
      transactions: [
        {
          id: "d1",
          ticker: "CASH",
          action: "deposit",
          quantity: 100_000,
          price: 1,
          fees: 0,
          tradeCurrency: "HKD",
          fxToBase: 1,
          tradeDate: "2026-01-02",
          createdAtMs: 1,
        },
        {
          id: "b1",
          ticker: "0700.HK",
          action: "buy",
          quantity: 100,
          price: 400,
          fees: 0,
          tradeCurrency: "HKD",
          fxToBase: 1,
          tradeDate: "2026-01-02",
          createdAtMs: 2,
        },
      ],
      barsByTicker: new Map([
        [
          "0700.HK",
          [
            { barDate: "2026-01-02", close: 400 },
            { barDate: "2026-01-05", close: 440 },
          ],
        ],
      ]),
      splitsByTicker: new Map(),
      dividendsByTicker: new Map(),
      fxRatesByCurrency: new Map([
        [
          "HKD",
          [
            { rateDate: "2026-01-02", usdPerUnit: 1 / 7.8 },
            { rateDate: "2026-01-05", usdPerUnit: 1 / 7.8 },
          ],
        ],
      ]),
      spyBars: [
        { barDate: "2026-01-02", close: 500 },
        { barDate: "2026-01-05", close: 505 },
      ],
      spyDividends: [],
      asOfDate: "2026-01-05",
    });
    expect(res.fxContribution).toBe(0);
    expect(res.localContribution).toBeCloseTo(4000, 2);
  });

  it("marks basis=fx_stale and nullifies TWR when FX rate is missing beyond 5 business days", () => {
    const res = buildPortfolioPerformanceSeries({
      accountId: "acct-stale-fx",
      baseCurrency: "EUR",
      transactions: [
        {
          id: "d1",
          ticker: "CASH",
          action: "deposit",
          quantity: 1000,
          price: 1,
          fees: 0,
          tradeCurrency: "EUR",
          fxToBase: 1,
          tradeDate: "2026-01-02",
          createdAtMs: 1,
        },
        {
          id: "b1",
          ticker: "NVDA",
          action: "buy",
          quantity: 5,
          price: 100,
          fees: 0,
          tradeCurrency: "USD",
          fxToBase: 1,
          tradeDate: "2026-01-02",
          createdAtMs: 2,
        },
      ],
      barsByTicker: new Map([
        [
          "NVDA",
          [
            { barDate: "2026-01-02", close: 100 },
            { barDate: "2026-01-20", close: 110 },
          ],
        ],
      ]),
      splitsByTicker: new Map(),
      dividendsByTicker: new Map(),
      fxRatesByCurrency: new Map([["EUR", [{ rateDate: "2026-01-02", usdPerUnit: 1.0 }]]]),
      spyBars: [],
      spyDividends: [],
      asOfDate: "2026-01-20",
    });
    expect(res.basis).toBe("fx_stale");
    expect(res.twrPct).toBeNull();
  });

  it("transaction reversal produces bit-identical replay result as never recording the transaction", () => {
    const baseTxs = [
      {
        id: "d1",
        ticker: "CASH",
        action: "deposit" as const,
        quantity: 10_000,
        price: 1,
        fees: 0,
        tradeDate: "2026-01-02",
        createdAtMs: 1,
      },
    ];
    const withBuyAndReversal = [
      ...baseTxs,
      {
        id: "b1",
        ticker: "NVDA",
        action: "buy" as const,
        quantity: 10,
        price: 150,
        fees: 5,
        tradeDate: "2026-01-03",
        createdAtMs: 2,
      },
      {
        id: "rev1",
        ticker: "NVDA",
        action: "buy" as const,
        quantity: 10,
        price: 150,
        fees: 5,
        tradeDate: "2026-01-03",
        createdAtMs: 3,
        reversesTxId: "b1",
      },
    ];
    const rClean = replayLedgerTransactions({ transactions: baseTxs, splitsByTicker: new Map() });
    const rReversed = replayLedgerTransactions({
      transactions: withBuyAndReversal,
      splitsByTicker: new Map(),
    });
    expect(rReversed).toEqual(rClean);
  });
});
