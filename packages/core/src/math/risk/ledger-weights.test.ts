import { describe, expect, it } from "vitest";
import { computeLedgerPortfolioWeights } from "./ledger-weights";

const HKD_RATES = new Map([["HKD", [{ rateDate: "2026-01-06", usdPerUnit: 0.125 }]]]);
const transactions = [
  {
    id: "dep",
    ticker: "CASH",
    action: "deposit" as const,
    quantity: 10_000,
    price: 1,
    fees: 0,
    tradeCurrency: "USD",
    fxToBase: 1,
    tradeDate: "2026-01-02",
    createdAtMs: 1,
  },
  {
    id: "buy",
    ticker: "0700-HK",
    action: "buy" as const,
    quantity: 100,
    price: 400,
    fees: 0,
    tradeCurrency: "HKD",
    fxToBase: 0.128,
    tradeDate: "2026-01-02",
    createdAtMs: 2,
  },
];

describe("V0-3 · FX-aware ledger risk weights (G33)", () => {
  it("marks foreign holdings at the as-of ECB cross rate and refuses to guess when it is missing", () => {
    const weights = computeLedgerPortfolioWeights({
      transactions,
      splitsByTicker: new Map(),
      latestCloseByTicker: new Map([["0700-HK", 420]]),
      baseCurrency: "USD",
      fxRatesByCurrency: HKD_RATES,
      asOfDate: "2026-01-06",
    });
    const mv = 100 * 420 * 0.125;
    const cash = 10_000 - 100 * 400 * 0.128;
    expect(weights.fxMissingTickers).toEqual([]);
    expect(weights.holdings[0]?.weightPct).toBeCloseTo((mv / (mv + cash)) * 100, 3);

    const noFx = computeLedgerPortfolioWeights({
      transactions,
      splitsByTicker: new Map(),
      latestCloseByTicker: new Map([["0700-HK", 420]]),
      baseCurrency: "USD",
      fxRatesByCurrency: new Map(),
      asOfDate: "2026-01-06",
    });
    expect(noFx.fxMissingTickers).toEqual(["0700-HK"]);
  });
});
