import { describe, expect, it } from "vitest";
import { runValuationMonteCarlo } from "./monte-carlo";

describe("Seeded Valuation Monte Carlo Engine (W2.3)", () => {
  const baseInput = {
    seed: 20261126,
    iterations: 2000,
    currentPrice: 150,
    targetPrice: 225,
    baseRevenueB: 80,
    dilutedSharesM: 1000,
    netCashB: 10,
    horizonYears: 3,
    taxRatePct: 20,
    revenueCagrPct: { mean: 18, stdDev: 5, min: -10, max: 45 },
    operatingMarginPct: { mean: 30, stdDev: 4, min: 5, max: 55 },
    exitMultiple: { mean: 20, stdDev: 4, min: 8, max: 40 },
  };

  it("produces bit-for-bit identical distributions for the same seed and monotonic percentiles", () => {
    const run1 = runValuationMonteCarlo(baseInput);
    const run2 = runValuationMonteCarlo(baseInput);
    expect(run1).toEqual(run2);
    expect(run1.p5).toBeLessThanOrEqual(run1.p10);
    expect(run1.p10).toBeLessThanOrEqual(run1.p25);
    expect(run1.p25).toBeLessThanOrEqual(run1.p50);
    expect(run1.p50).toBeLessThanOrEqual(run1.p75);
    expect(run1.p75).toBeLessThanOrEqual(run1.p90);
    expect(run1.p90).toBeLessThanOrEqual(run1.p95);
    expect(run1.sensitivityPearson.exitMultiple).toBeGreaterThan(0.2);
    expect(run1.sensitivityPearson.revenueCagr).toBeGreaterThan(0.2);
  });
});
