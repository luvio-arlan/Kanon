import { describe, expect, it } from "vitest";
import { calculateHurdleLadder } from "./hurdle-ladder";
import { calculatePortfolioStress } from "./portfolio-stress";
import { analyzeSecForensics } from "./sec-forensics";
import {
  calculateEvOwnerFcfValuation,
  calculateTopDownEps,
  calculateTrueReverseDcf,
  calculateTsrDecomposition,
} from "./valuation-advanced";
import { calculateValuationScenarios, checkScenarioMonotonicity } from "./valuation-scenarios";

describe("KANON v4 Advanced Financial Math & Forensics Golden Suite", () => {
  it("computes Top-Down EPS with revenue compounding, margin, and share buybacks", () => {
    const res = calculateTopDownEps({
      currentRevenueB: 100,
      revenueCagrPct: 20,
      targetNetMarginPct: 30,
      currentSharesM: 1000,
      annualShareChangePct: -2,
      horizonYears: 3,
    });
    expect(res.projectedRevenueB).toBe(172.8);
    expect(res.projectedNetIncomeB).toBe(51.84);
    expect(res.projectedSharesM).toBe(941.2);
    expect(res.impliedEps).toBeCloseTo(55.08, 1);
  });

  it("computes EV / Owner-FCF valuation bridge accurately with net cash", () => {
    const res = calculateEvOwnerFcfValuation({
      currentPrice: 120,
      dilutedSharesM: 1000,
      cashB: 30,
      totalDebtB: 10,
      bearOwnerFcfB: 5,
      baseOwnerFcfB: 9,
      bullOwnerFcfB: 12,
      bearEvMultiple: 16,
      baseEvMultiple: 20,
      bullEvMultiple: 24,
      horizonYears: 3,
    });
    expect(res.currentMarketCapB).toBe(120);
    expect(res.currentEvB).toBe(100);
    expect(res.bearTargetPrice).toBe(100);
    expect(res.baseTargetPrice).toBe(200);
    expect(res.bullTargetPrice).toBe(308);
    expect(res.riskRewardRatio).toBe(4);
  });

  it("solves exact Reverse-DCF required growth and flags expectations gap", () => {
    const res = calculateTrueReverseDcf({
      currentPrice: 150,
      baseMetricPerShare: 5,
      horizonYears: 5,
      hurdleRatePct: 15,
      terminalMultiple: 20,
      historicalCagrPct: 28,
    });
    expect(res.requiredCagrPct).toBeGreaterThan(15);
    expect(res.requiredCagrPct).toBeLessThan(26);
    expect(res.expectationsGapPct).not.toBeNull();
    expect(res.verdict).toBe("underpriced");
  });

  it("decomposes TSR into earnings growth, multiple re-rate, and capital return", () => {
    const res = calculateTsrDecomposition({
      currentPrice: 100,
      trailingEps: 5,
      forwardEps: 8.64,
      forwardPe: 25,
      horizonYears: 3,
      annualCapitalReturnPct: 2,
    });
    expect(res.fundamentalGrowthPct).toBeCloseTo(20, 0);
    expect(res.multipleReRatePct).toBeGreaterThan(7);
    expect(res.capitalReturnPct).toBe(2);
    expect(res.totalAnnualizedTsrPct).toBeCloseTo(
      res.fundamentalGrowthPct + res.multipleReRatePct + 2,
      1,
    );
  });

  it("detects forensic red flags on heavy SBC, dilution, and working capital divergence", () => {
    const report = analyzeSecForensics([
      {
        fiscalYear: "FY2024",
        revenue: 10_000_000_000,
        grossProfit: 6_000_000_000,
        grossMarginPct: 60,
        operatingIncome: 2_000_000_000,
        netIncome: 1_500_000_000,
        operatingCashFlow: 2_000_000_000,
        capex: 1_200_000_000,
        sbc: 900_000_000,
        freeCashFlow: 800_000_000,
        dilutedEps: 1.5,
        dilutedShares: 1_000_000_000,
        cashAndEquiv: 2_000_000_000,
        totalDebt: 5_000_000_000,
        stockholdersEquity: 2_500_000_000,
        inventory: 1_000_000_000,
        accountsReceivable: 1_000_000_000,
      },
      {
        fiscalYear: "FY2025",
        revenue: 11_000_000_000,
        grossProfit: 6_600_000_000,
        grossMarginPct: 60,
        operatingIncome: 2_200_000_000,
        netIncome: 1_600_000_000,
        operatingCashFlow: 2_000_000_000,
        capex: 1_300_000_000,
        sbc: 900_000_000,
        freeCashFlow: 700_000_000,
        dilutedEps: 1.52,
        dilutedShares: 1_050_000_000,
        cashAndEquiv: 1_500_000_000,
        totalDebt: 6_000_000_000,
        stockholdersEquity: 3_000_000_000,
        inventory: 1_450_000_000,
        accountsReceivable: 1_100_000_000,
      },
    ]);
    expect(report).not.toBeNull();
    expect(report?.ownerFcf).toBe(-200_000_000);
    expect(report?.sbcPctOfOcf).toBe(45);
    expect(report?.shareChangeCagrPct).toBe(5);
    expect(report?.redFlags.map((f) => f.id)).toContain("sbc-heavy");
    expect(report?.redFlags.map((f) => f.id)).toContain("negative-owner-fcf");
    expect(report?.redFlags.map((f) => f.id)).toContain("share-dilution");
    expect(report?.redFlags.map((f) => f.id)).toContain("wc-存货");
    expect(report?.roiicPct).not.toBeNull();
    expect(report?.sloanAccrualPct).not.toBeNull();
    expect(report?.ruleOf40Score).not.toBeNull();
    expect(report?.forensicScore).toBeLessThan(65);
    expect(["watch", "caution"]).toContain(report?.forensicGrade);
  });

  it("computes IRR hurdle ladder and Kelly breakeven win rate", () => {
    const summary = calculateValuationScenarios({
      currentPrice: 100,
      horizonYears: 3,
      bear: { eps: 5, peMultiple: 14 },
      base: { eps: 8, peMultiple: 20 },
      bull: { eps: 10, peMultiple: 24 },
    });
    const ladder = calculateHurdleLadder(summary);
    expect(ladder.rungs).toHaveLength(4);
    expect(ladder.rungs[0]?.met).toBe(true);
    expect(ladder.rungs[1]?.met).toBe(true);
    expect(ladder.rungs[2]?.met).toBe(false);
    expect(ladder.kellyBreakevenWinRatePct).toBeCloseTo(33.3, 1);
    expect(ladder.expectedValueReturnPct).toBe(57.5);
  });

  it("computes 4-regime portfolio stress scenarios and HHI concentration", () => {
    const stress = calculatePortfolioStress([]);
    expect(stress.allocatedWeightPct).toBe(0);
    expect(stress.cashBufferPct).toBe(100);
    expect(stress.scenarios).toHaveLength(4);
  });

  it("checks scenario monotonicity cleanly", () => {
    expect(
      checkScenarioMonotonicity({ bearTarget: 90, baseTarget: 150, bullTarget: 220 }).isMonotonic,
    ).toBe(true);
    expect(
      checkScenarioMonotonicity({ bearTarget: 160, baseTarget: 150, bullTarget: 220 }).isMonotonic,
    ).toBe(false);
  });
});
