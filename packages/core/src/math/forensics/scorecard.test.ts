import { describe, expect, it } from "vitest";
import {
  evaluateConsecutiveKpiPeriods,
  evaluateSafeKpiExpression,
} from "../models/kpi-expression-parser";
import { INDUSTRY_KPI_TEMPLATES } from "../models/kpi-templates";
import {
  calculateAltmanZScore,
  calculateBeneishMScore,
  calculateDuPontDecomposition,
  calculatePiotroskiFScore,
} from "./index";

describe("Institutional Forensics Scorecards & Safe KPI Engine (W2.5-W2.6)", () => {
  it("flags aggressive accruals with Beneish M-Score > -1.78 and passes clean compounder", () => {
    const prior = {
      revenue: 1000,
      costOfRevenue: 600,
      sgaExpense: 150,
      depreciation: 50,
      netIncome: 120,
      operatingCashFlow: 135,
      accountsReceivable: 100,
      currentAssets: 400,
      ppeNet: 300,
      totalAssets: 1000,
      currentLiabilities: 200,
      longTermDebt: 200,
    };
    const clean = calculateBeneishMScore(
      { ...prior, revenue: 1120, netIncome: 140, operatingCashFlow: 165 },
      prior,
    );
    expect(clean.flaggedManipulator).toBe(false);

    const aggressive = calculateBeneishMScore(
      {
        ...prior,
        revenue: 1600,
        accountsReceivable: 380,
        netIncome: 280,
        operatingCashFlow: 20,
        ppeNet: 220,
        totalAssets: 1600,
      },
      prior,
    );
    expect(aggressive.flaggedManipulator).toBe(true);
    expect(aggressive.mScore).toBeGreaterThan(-1.78);
  });

  it("evaluates Altman Z / Z'' and explicitly excludes financial & REIT sectors", () => {
    const bank = calculateAltmanZScore({
      sector: "Commercial Bank / 银行",
      workingCapital: 10,
      retainedEarnings: 50,
      ebit: 20,
      marketCap: 200,
      totalLiabilities: 900,
      revenue: 80,
      totalAssets: 1000,
    });
    expect(bank.applicable).toBe(false);

    const safeMfg = calculateAltmanZScore({
      sector: "Semiconductors",
      isManufacturing: true,
      workingCapital: 300,
      retainedEarnings: 450,
      ebit: 250,
      marketCap: 2000,
      totalLiabilities: 400,
      revenue: 900,
      totalAssets: 1000,
    });
    expect(safeMfg.applicable).toBe(true);
    if (safeMfg.applicable) {
      expect(safeMfg.variant).toBe("Z");
      expect(safeMfg.zone).toBe("safe");
    }
  });

  it("computes 9-point Piotroski F-Score and 5-factor DuPont ROE identity", () => {
    const f = calculatePiotroskiFScore(
      {
        netIncome: 180,
        operatingCashFlow: 220,
        totalAssets: 1000,
        longTermDebt: 120,
        currentAssets: 500,
        currentLiabilities: 200,
        dilutedShares: 98,
        grossProfit: 660,
        revenue: 1100,
      },
      {
        netIncome: 120,
        operatingCashFlow: 130,
        totalAssets: 1000,
        longTermDebt: 180,
        currentAssets: 420,
        currentLiabilities: 210,
        dilutedShares: 100,
        grossProfit: 560,
        revenue: 1000,
      },
    );
    expect(f.score).toBe(9);
    expect(f.grade).toBe("strong");

    const dupont = calculateDuPontDecomposition({
      netIncome: 80,
      pretaxIncome: 100,
      ebit: 125,
      revenue: 500,
      averageAssets: 1000,
      averageEquity: 400,
    });
    expect(dupont.roePct).toBeCloseTo(20, 2);
    expect(dupont.taxBurden).toBeCloseTo(0.8, 3);
    expect(dupont.equityMultiplier).toBeCloseTo(2.5, 3);
  });

  it("parses safe KPI expressions across 7 industry templates and consecutive-period streaks", () => {
    expect(INDUSTRY_KPI_TEMPLATES).toHaveLength(7);
    const rule40 = evaluateSafeKpiExpression("revenueGrowthPct + fcfMarginPct >= 40", {
      revenueGrowthPct: 24,
      fcfMarginPct: 22,
    });
    expect(rule40.ok && rule40.passed).toBe(true);

    const streak = evaluateConsecutiveKpiPeriods(
      "grossMarginPct >= 50",
      [{ grossMarginPct: 48 }, { grossMarginPct: 52 }, { grossMarginPct: 55 }],
      2,
    );
    expect(streak.triggered).toBe(true);
    expect(streak.matchedPeriods).toBe(2);

    const rejected = evaluateSafeKpiExpression("process.exit(1)", {});
    expect(rejected.ok).toBe(false);
  });
});
