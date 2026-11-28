import { describe, expect, it } from "vitest";
import {
  calculateLogLoss,
  calculateMultiClassBrierScore,
  calculateMurphyDecomposition,
  classifyProcessOutcomeMatrix,
} from "./forecast-scoring";
import {
  calculateBrinsonAttribution,
  calculateMwrIrrPct,
  calculateTwrPct,
} from "./performance-attribution";

describe("Forecast Scoring, Murphy Decomposition & Performance Attribution (W5.1-W5.3)", () => {
  it("computes proper multi-class Brier, log loss, and Murphy reliability/resolution/uncertainty", () => {
    expect(calculateMultiClassBrierScore([])).toBeNull();
    const brier = calculateMultiClassBrierScore([
      { probabilities: [0.2, 0.6, 0.2], outcomeIndex: 1 }, // (0.2)^2 + (-0.4)^2 + (0.2)^2 = 0.24
      { probabilities: [0.1, 0.8, 0.1], outcomeIndex: 1 }, // 0.01 + 0.04 + 0.01 = 0.06
    ]);
    expect(brier).toBeCloseTo(0.15, 4);
    const logLoss = calculateLogLoss([{ probabilities: [0.2, 0.8], outcomeIndex: 1 }]);
    expect(logLoss).toBeCloseTo(-Math.log(0.8), 4);

    const murphy = calculateMurphyDecomposition([
      { probability: 0.85, occurred: true },
      { probability: 0.85, occurred: true },
      { probability: 0.15, occurred: false },
      { probability: 0.15, occurred: false },
    ]);
    expect(murphy).not.toBeNull();
    expect(murphy?.uncertainty).toBeCloseTo(0.25, 3);
    expect(murphy?.resolution).toBeCloseTo(0.25, 3);
    expect(murphy?.brierScore).toBeCloseTo(0.0225, 4);

    const matrix = classifyProcessOutcomeMatrix([
      { goodProcess: true, goodOutcome: true },
      { goodProcess: false, goodOutcome: true },
      { goodProcess: true, goodOutcome: false },
    ]);
    expect(matrix).toEqual({
      deservedWin: 1,
      dumbLuck: 1,
      badBreak: 1,
      expectedLoss: 0,
      total: 3,
    });
  });

  it("computes TWR, XIRR (MWR), and Brinson allocation + selection + interaction", () => {
    expect(calculateTwrPct([0.1, 0.1])).toBeCloseTo(21, 2);
    const irr = calculateMwrIrrPct([
      { date: "2025-01-01", amount: -100_000 },
      { date: "2026-01-01", amount: 120_000 },
    ]);
    expect(irr).toBeCloseTo(20, 0);

    const brinson = calculateBrinsonAttribution([
      {
        sector: "Tech",
        portfolioWeight: 0.6,
        benchmarkWeight: 0.4,
        portfolioReturn: 0.25,
        benchmarkReturn: 0.15,
      },
      {
        sector: "Staples",
        portfolioWeight: 0.4,
        benchmarkWeight: 0.6,
        portfolioReturn: 0.05,
        benchmarkReturn: 0.05,
      },
    ]);
    expect(brinson.allocationEffectPct).toBeCloseTo(2, 2);
    expect(brinson.selectionEffectPct).toBeCloseTo(4, 2);
    expect(brinson.interactionEffectPct).toBeCloseTo(2, 2);
    expect(brinson.totalActiveReturnPct).toBeCloseTo(8, 2);
  });
});
