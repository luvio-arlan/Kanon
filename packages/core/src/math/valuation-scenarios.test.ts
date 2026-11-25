import { describe, expect, it } from "vitest";
import {
  calculateAverageRiskReward,
  calculatePriceMarkerPosition,
  calculateValuationScenarios,
  roundTo,
  sanitizeValuationInput,
} from "./valuation-scenarios";

describe("roundTo", () => {
  it("rounds floating-point edge values deterministically without -0", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-0.0001, 2)).toBe(0);
    expect(Object.is(roundTo(-0.0001, 2), -0)).toBe(false);
  });
});

describe("calculateValuationScenarios", () => {
  it("computes Micron (MU) 3-year valuation targets, CAGR, odds, and expected value", () => {
    const result = calculateValuationScenarios({
      currentPrice: 108,
      horizonYears: 3,
      bear: { eps: 7.5, peMultiple: 12 },
      base: { eps: 12.5, peMultiple: 14 },
      bull: { eps: 16.0, peMultiple: 16 },
    });

    expect(result.bear.targetPrice).toBe(90);
    expect(result.base.targetPrice).toBe(175);
    expect(result.bull.targetPrice).toBe(256);

    expect(result.upsidePct).toBe(62);
    expect(result.bullUpsidePct).toBe(137);
    expect(result.downsidePct).toBe(16.7);
    expect(result.riskRewardRatio).toBe(3.72);
    expect(result.bullRiskRewardRatio).toBe(8.22);
    expect(result.isAsymmetricFloor).toBe(false);
    expect(result.expectedTargetPrice).toBe(174);
    expect(result.expectedReturnPct).toBe(61.1);
    expect(result.base.cagrPct).toBe(17.5);
    expect(result.convictionZone).toBe("attractive");
  });

  it("handles asymmetric margin-of-safety floor where bear target >= current price", () => {
    const result = calculateValuationScenarios({
      currentPrice: 95,
      horizonYears: 3,
      bear: { eps: 8, peMultiple: 12 },
      base: { eps: 11, peMultiple: 15 },
      bull: { eps: 14, peMultiple: 18 },
    });

    expect(result.bear.targetPrice).toBe(96);
    expect(result.downsidePct).toBe(-1.1);
    expect(result.riskRewardRatio).toBeNull();
    expect(result.bullRiskRewardRatio).toBeNull();
    expect(result.isAsymmetricFloor).toBe(true);
    expect(result.convictionZone).toBe("attractive");
  });

  it("classifies stretched valuation when base target is below current price", () => {
    const result = calculateValuationScenarios({
      currentPrice: 200,
      horizonYears: 2,
      bear: { eps: 5, peMultiple: 20 },
      base: { eps: 6, peMultiple: 30 },
      bull: { eps: 8, peMultiple: 32 },
    });

    expect(result.base.targetPrice).toBe(180);
    expect(result.upsidePct).toBe(-10);
    expect(result.riskRewardRatio).toBe(0);
    expect(result.convictionZone).toBe("stretched");
  });

  it("classifies balanced valuation when risk/reward is between 1.2 and 2.5", () => {
    const result = calculateValuationScenarios({
      currentPrice: 138,
      horizonYears: 3,
      bear: { eps: 4.4, peMultiple: 24 },
      base: { eps: 6.2, peMultiple: 32 },
      bull: { eps: 7.5, peMultiple: 36 },
    });

    expect(result.bear.targetPrice).toBe(105.6);
    expect(result.base.targetPrice).toBe(198.4);
    expect(result.riskRewardRatio).toBe(1.86);
    expect(result.convictionZone).toBe("balanced");
  });

  it("supports custom scenario probabilities that sum to 1", () => {
    const result = calculateValuationScenarios({
      currentPrice: 100,
      horizonYears: 3,
      bear: { eps: 8, peMultiple: 10, probability: 0.2 },
      base: { eps: 10, peMultiple: 15, probability: 0.6 },
      bull: { eps: 12, peMultiple: 20, probability: 0.2 },
    });

    expect(result.expectedTargetPrice).toBe(154);
    expect(result.expectedReturnPct).toBe(54);
  });

  it("rejects partial or non-unit scenario probabilities", () => {
    expect(() =>
      calculateValuationScenarios({
        currentPrice: 100,
        bear: { eps: 8, peMultiple: 10, probability: 0.3 },
        base: { eps: 10, peMultiple: 15, probability: 0.3 },
        bull: { eps: 12, peMultiple: 20, probability: 0.3 },
      }),
    ).toThrow(/sum to 1\.0/);

    expect(() =>
      calculateValuationScenarios({
        currentPrice: 100,
        bear: { eps: 8, peMultiple: 10, probability: 0.3 },
        base: { eps: 10, peMultiple: 15 },
        bull: { eps: 12, peMultiple: 20 },
      }),
    ).toThrow(/all three scenarios/);
  });

  it("rejects invalid non-positive or non-finite inputs", () => {
    expect(() =>
      calculateValuationScenarios({
        currentPrice: 0,
        bear: { eps: 5, peMultiple: 10 },
        base: { eps: 8, peMultiple: 15 },
        bull: { eps: 10, peMultiple: 20 },
      }),
    ).toThrow();

    expect(() =>
      calculateValuationScenarios({
        currentPrice: Number.NaN,
        bear: { eps: 5, peMultiple: 10 },
        base: { eps: 8, peMultiple: 15 },
        bull: { eps: 10, peMultiple: 20 },
      }),
    ).toThrow();

    expect(() =>
      calculateValuationScenarios({
        currentPrice: 100,
        bear: { eps: -2, peMultiple: 10 },
        base: { eps: 8, peMultiple: 15 },
        bull: { eps: 10, peMultiple: 20 },
      }),
    ).toThrow();
  });
  it("rejects runaway out-of-bounds EPS/PE/price and heals corrupted inputs via sanitizeValuationInput", () => {
    expect(() =>
      calculateValuationScenarios({
        currentPrice: 492.5,
        horizonYears: 5,
        bear: { eps: 50, peMultiple: 28 },
        base: { eps: 1e31, peMultiple: 30 },
        bull: { eps: 1e31, peMultiple: 35 },
      }),
    ).toThrow();

    const healed = sanitizeValuationInput({
      currentPrice: 492.5,
      horizonYears: 5,
      bear: { eps: 50, peMultiple: 28 },
      base: { eps: 1.35e31, peMultiple: 30 },
      bull: { eps: 1.13e31, peMultiple: 35 },
    });
    const summary = calculateValuationScenarios(healed);
    expect(summary.bear.eps).toBe(50);
    expect(summary.base.eps).toBeLessThan(1000);
    expect(summary.bull.eps).toBeLessThan(1000);
    expect(Number.isFinite(summary.base.targetPrice)).toBe(true);
  });
});

describe("calculatePriceMarkerPosition", () => {
  it("computes bounded percentage marker position between bear and bull targets", () => {
    expect(calculatePriceMarkerPosition(108, 90, 256)).toBe(10.8);
    expect(calculatePriceMarkerPosition(70, 90, 256)).toBe(0);
    expect(calculatePriceMarkerPosition(300, 90, 256)).toBe(100);
    expect(calculatePriceMarkerPosition(100, 100, 100)).toBe(50);
  });
});

describe("calculateAverageRiskReward", () => {
  it("averages finite risk/reward ratios while ignoring asymmetric null floors", () => {
    expect(calculateAverageRiskReward([3.72, 1.86])).toBe(2.79);
    expect(calculateAverageRiskReward([3.72, null])).toBe(3.72);
    expect(calculateAverageRiskReward([null, null])).toBeNull();
  });
});
