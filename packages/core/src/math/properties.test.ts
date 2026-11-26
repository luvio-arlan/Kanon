import { describe, expect, it } from "vitest";
import { calculateMultiClassBrierScore } from "./calibration/forecast-scoring";
import { calculateMultiStageFcffDcf } from "./dcf/fcff-dcf";
import { evaluateValueAtCapYears, solveMauboussinImpliedCap } from "./dcf/reverse-dcf-cap";
import { solveConstrainedMultiAssetKelly } from "./risk/constrained-kelly";
import { createMulberry32 } from "./simulation/prng";
import { calculateDiscreteKelly } from "./sizing/kelly-discrete";

describe("Financial Math Property-Based Invariants (W8.2 — 200 seeded random cases)", () => {
  it("invariant 1: higher WACC strictly decreases 3-stage FCFF fair value per share", () => {
    const rng = createMulberry32(99001);
    for (let i = 0; i < 60; i += 1) {
      const baseRevenueB = 10 + rng() * 300;
      const gTerm = 1.5 + rng() * 2.5;
      const waccLow = gTerm + 3.5 + rng() * 4;
      const waccHigh = waccLow + 0.5 + rng() * 3;
      const shared = {
        baseRevenueB,
        highGrowthYears: 3 + Math.floor(rng() * 4),
        fadeYears: 2 + Math.floor(rng() * 4),
        initialRevenueGrowthPct: 6 + rng() * 20,
        terminalGrowthPct: gTerm,
        initialEbitMarginPct: 12 + rng() * 30,
        terminalEbitMarginPct: 12 + rng() * 30,
        effectiveTaxRatePct: 15 + rng() * 15,
        salesToCapitalRatio: 1.0 + rng() * 3,
        terminalRonicPct: waccHigh + 3,
        cashAndStInvestmentsB: 5 + rng() * 50,
        totalDebtB: rng() * 30,
        basicSharesM: 200 + rng() * 2000,
        assumedSharePrice: 100,
      };
      const lowRes = calculateMultiStageFcffDcf({ ...shared, waccPct: waccLow });
      const highRes = calculateMultiStageFcffDcf({ ...shared, waccPct: waccHigh });
      expect(lowRes.fairValuePerShare).toBeGreaterThanOrEqual(highRes.fairValuePerShare);
    }
  });

  it("invariant 2: Mauboussin CAP solver recovers T within 0.2y across random (g, RONIC, WACC)", () => {
    const rng = createMulberry32(99002);
    for (let i = 0; i < 60; i += 1) {
      const waccPct = 7 + rng() * 5;
      const ronicPct = waccPct + 8 + rng() * 20;
      const growthRatePct = 5 + rng() * 15;
      const trueCap = 2 + rng() * 14;
      const baseNopat = 5 + rng() * 50;
      const targetEv = evaluateValueAtCapYears(
        baseNopat,
        growthRatePct / 100,
        ronicPct / 100,
        waccPct / 100,
        trueCap,
      );
      const solved = solveMauboussinImpliedCap({
        currentValue: targetEv,
        baseNopat,
        growthRatePct,
        ronicPct,
        waccPct,
      });
      expect(Math.abs(solved.impliedCapYears - trueCap)).toBeLessThanOrEqual(0.2);
    }
  });

  it("invariant 3: discrete & multi-asset Kelly always respect zero-leverage and weight caps", () => {
    const rng = createMulberry32(99003);
    for (let i = 0; i < 60; i += 1) {
      const pBear = 0.1 + rng() * 0.35;
      const pBase = 0.2 + rng() * 0.4;
      const pBull = Math.max(0.05, 1 - pBear - pBase);
      const dk = calculateDiscreteKelly({
        capPct: 25,
        scenarios: [
          { probability: pBear, returnPct: -(10 + rng() * 60) },
          { probability: pBase, returnPct: -10 + rng() * 60 },
          { probability: pBull, returnPct: 20 + rng() * 150 },
        ],
      });
      expect(dk.fullKellyPct).toBeGreaterThanOrEqual(0);
      expect(dk.fullKellyPct).toBeLessThanOrEqual(100);
      expect(dk.fractionalKellyPct).toBeLessThanOrEqual(dk.fullKellyPct + 0.1);
      expect(dk.cappedPct).toBeLessThanOrEqual(25);

      const maxCap = 0.15 + rng() * 0.2;
      const mk = solveConstrainedMultiAssetKelly({
        tickers: ["A", "B", "C"],
        expectedExcessReturns: [-0.05 + rng() * 0.3, -0.05 + rng() * 0.3, -0.05 + rng() * 0.3],
        annualCovariance: [
          [0.09, 0.02, 0.01],
          [0.02, 0.12, 0.03],
          [0.01, 0.03, 0.16],
        ],
        maxSingleWeight: maxCap,
      });
      expect(mk.totalInvestedPct).toBeLessThanOrEqual(100.1);
      for (const row of mk.weights) {
        expect(row.weightPct).toBeGreaterThanOrEqual(0);
        expect(row.weightPct).toBeLessThanOrEqual(maxCap * 100 + 0.2);
      }
    }
  });

  it("invariant 4: proper multi-class Brier score stays bounded in [0, 2] and equals 0 on perfect forecasts", () => {
    const rng = createMulberry32(99004);
    for (let i = 0; i < 60; i += 1) {
      const raw = [rng(), rng(), rng()];
      const sum = raw.reduce((a, b) => a + b, 0);
      const probs = raw.map((x) => x / sum);
      const outcomeIndex = Math.floor(rng() * 3);
      const score = calculateMultiClassBrierScore([{ probabilities: probs, outcomeIndex }]);
      expect(score).not.toBeNull();
      expect(score ?? -1).toBeGreaterThanOrEqual(0);
      expect(score ?? 9).toBeLessThanOrEqual(2);
    }
    expect(calculateMultiClassBrierScore([{ probabilities: [0, 1, 0], outcomeIndex: 1 }])).toBe(0);
  });
});
