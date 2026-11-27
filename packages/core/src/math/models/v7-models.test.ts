import { describe, expect, it } from "vitest";
import { calculateCognitiveCalibration } from "../institutional/cognitive-calibration";
import { calculateEvOwnerFcfValuation, calculateTrueReverseDcf } from "../valuation-advanced";
import { calculateValuationScenarios } from "../valuation-scenarios";
import {
  calculateLinkedOperatingModel,
  calculateSotpValuation,
  classifyEconomicFactor,
  deriveDefaultLinkedDrivers,
  evaluateHypothesisKpi,
} from "./index";

describe("KANON v7 Institutional Financial Models", () => {
  it("runs linked 3-scenario operating & FCF model with cash accumulation", () => {
    const drivers = deriveDefaultLinkedDrivers({
      baseRevCagrPct: 15,
      baseOperatingMarginPct: 40,
      sbcPctOfRev: 3,
      capexPctOfRev: 10,
      basePe: 25,
    });
    const res = calculateLinkedOperatingModel({
      currentPrice: 400,
      currentRevenueB: 250,
      currentSharesM: 7450,
      cashB: 80,
      totalDebtB: 60,
      horizonYears: 3,
      drivers,
    });
    expect(res.base.endingRevenueB).toBeGreaterThan(350);
    expect(res.base.endingNetCashB).toBeGreaterThan(20);
    expect(res.bull.evFcfTargetPrice).toBeGreaterThan(res.base.evFcfTargetPrice);
    expect(res.base.evFcfTargetPrice).toBeGreaterThan(res.bear.evFcfTargetPrice);
  });

  it("computes SOTP valuation with net cash and holding discount", () => {
    const res = calculateSotpValuation({
      segments: [
        {
          id: "s1",
          name: "Cloud",
          metricLabel: "EBIT",
          metricValueB: 50,
          bearMultiple: 20,
          baseMultiple: 26,
          bullMultiple: 32,
        },
        {
          id: "s2",
          name: "Software",
          metricLabel: "EBIT",
          metricValueB: 40,
          bearMultiple: 16,
          baseMultiple: 20,
          bullMultiple: 24,
        },
      ],
      netCashB: 100,
      dilutedSharesM: 5000,
      holdingDiscountPct: 10,
      currentPrice: 300,
      horizonYears: 3,
    });
    expect(res.baseEnterpriseB).toBe(2100);
    expect(res.baseEquityB).toBe(1980);
    expect(res.baseTargetPrice).toBe(396);
    expect(res.segments[0]?.baseSharePct).toBeCloseTo(61.9, 1);
  });

  it("evaluates structured hypothesis KPI rules against SEC annuals", () => {
    const evaluation = evaluateHypothesisKpi(
      {
        id: "h1",
        title: "毛利率维持高位",
        metricLabel: "Gross Margin",
        threshold: ">= 68%",
        status: "watching",
        note: "",
        kpiRule: { metricKey: "grossMarginPct", operator: ">=", targetValue: 68 },
      },
      [
        {
          fiscalYear: "FY2025",
          revenue: 100e9,
          grossProfit: 70e9,
          grossMarginPct: 70,
          netIncome: 35e9,
          operatingCashFlow: 45e9,
          capex: 10e9,
          freeCashFlow: 35e9,
          dilutedEps: 5,
        },
      ],
    );
    expect(evaluation?.passed).toBe(true);
    expect(evaluation?.suggestedStatus).toBe("validated");
  });

  it("normalizes diverse sector tags into canonical economic factor clusters", () => {
    expect(classifyEconomicFactor("AI 存储芯片", "MU")).toBe("AI 与半导体周期");
    expect(classifyEconomicFactor("先进制程晶圆代工", "TSM")).toBe("AI 与半导体周期");
    expect(classifyEconomicFactor("光刻设备", "ASML")).toBe("AI 与半导体周期");
    expect(classifyEconomicFactor("企业云与AI", "MSFT")).toBe("云计算与企业软件");
  });

  it("applies RONIC reinvestment constraint in Reverse DCF", () => {
    const unconstrained = calculateTrueReverseDcf({
      currentPrice: 200,
      baseMetricPerShare: 6,
      horizonYears: 5,
      hurdleRatePct: 15,
      terminalMultiple: 22,
    });
    const constrained = calculateTrueReverseDcf({
      currentPrice: 200,
      baseMetricPerShare: 6,
      horizonYears: 5,
      hurdleRatePct: 15,
      terminalMultiple: 22,
      ronicPct: 30,
    });
    expect(constrained.requiredCagrPct).toBeGreaterThan(unconstrained.requiredCagrPct);
    expect(constrained.impliedReinvestmentRatePct).not.toBeNull();
    expect(constrained.impliedCapYears).toBeGreaterThanOrEqual(5);
  });

  it("avoids starter score inflation and computes Brier score & benchmark alpha", () => {
    const valInput = {
      currentPrice: 120,
      horizonYears: 3,
      bear: { eps: 4, peMultiple: 15, probability: 0.25 },
      base: { eps: 6, peMultiple: 20, probability: 0.5 },
      bull: { eps: 8, peMultiple: 24, probability: 0.25 },
    };
    const report = calculateCognitiveCalibration(
      {
        id: "t1",
        indexLabel: "01",
        ticker: "TEST",
        companyName: "Test Co",
        sectorTag: "Software",
        currentPrice: 120,
        lastReviewedAt: "now",
        horizonLabel: "3 年周期",
        horizonYears: 3,
        portfolioRole: "core",
        currentWeightPct: 10,
        targetMaxWeightPct: 15,
        avgCostBasis: 100,
        convictionSummary: "summary",
        status: "active",
        businessFilter: {
          recurringRevenue: "pass",
          pricingPower: "pass",
          capitalReturn: "pass",
          governance: "pass",
          notes: "",
          vetoReason: "",
          consensusView: "",
          variantPerception: "",
          keyDebate: "",
          preMortem: "",
        },
        hypotheses: [
          { id: "h1", title: "A", metricLabel: "M", threshold: "T", status: "watching", note: "" },
          { id: "h2", title: "B", metricLabel: "M", threshold: "T", status: "watching", note: "" },
          { id: "h3", title: "C", metricLabel: "M", threshold: "T", status: "watching", note: "" },
        ],
        catalysts: [],
        crossChecks: [],
        valuationInput: valInput,
        valuationModelMode: "pe",
        valuationDriverInputs: null,
        valuation: calculateValuationScenarios(valInput),
        priceHistory: [],
        disciplineEntries: [
          {
            id: "d1",
            action: "buy",
            noLeverageConfirmed: true,
            positionCapConfirmed: true,
            exitRule: "rule",
            emotion: "calm",
            priceAnchor: 100,
            benchmarkPrice: 500,
            note: "",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        updatedAt: "2026-01-01T00:00:00Z",
      },
      [],
      120,
      550,
    );
    expect(report.zeroLeverageGatePassed).toBe(true);
    expect(report.brierScore).toBeNull();
    expect(report.avgBenchmarkAlphaPct).toBe(10);
  });

  it("avoids SBC double-counting, aligns EV/EBIT tax, retains 100% negative FCF, and floors equity at 0", () => {
    const lowSbc = deriveDefaultLinkedDrivers({
      baseRevCagrPct: 12,
      baseOperatingMarginPct: 30,
      sbcPctOfRev: 1,
      capexPctOfRev: 8,
      basePe: 20,
    });
    const highSbc = {
      ...lowSbc,
      base: { ...lowSbc.base, sbcPctOfRev: 12 },
    };
    const rLow = calculateLinkedOperatingModel({
      currentPrice: 100,
      currentRevenueB: 50,
      currentSharesM: 1000,
      cashB: 10,
      totalDebtB: 5,
      horizonYears: 3,
      drivers: lowSbc,
    });
    const rHigh = calculateLinkedOperatingModel({
      currentPrice: 100,
      currentRevenueB: 50,
      currentSharesM: 1000,
      cashB: 10,
      totalDebtB: 5,
      horizonYears: 3,
      drivers: highSbc,
    });
    expect(rHigh.base.endingOwnerFcfB).toBe(rLow.base.endingOwnerFcfB);
    expect(rLow.base.evEbitTargetPrice).toBeGreaterThan(rLow.base.evFcfTargetPrice);

    const distressed = calculateLinkedOperatingModel({
      currentPrice: 50,
      currentRevenueB: 10,
      currentSharesM: 1000,
      cashB: 2,
      totalDebtB: 500,
      horizonYears: 3,
      drivers: {
        ...lowSbc,
        cashRetentionPct: 20,
        bear: {
          ...lowSbc.bear,
          targetOperatingMarginPct: -20,
          capexPctOfRev: 15,
        },
      },
    });
    expect(distressed.bear.cumulativeFcfB).toBeLessThan(0);
    expect(distressed.bear.endingNetCashB).toBeCloseTo(2 - 500 + distressed.bear.cumulativeFcfB, 1);
    expect(distressed.bear.evFcfTargetPrice).toBe(0);
    expect(distressed.bear.evEbitTargetPrice).toBe(0);
  });

  it("applies SOTP holdco discount only to positive equity and solves non-monotonic RONIC Reverse-DCF", () => {
    const negSotp = calculateSotpValuation({
      segments: [
        {
          id: "s1",
          name: "Legacy",
          metricLabel: "EBIT",
          metricValueB: 5,
          bearMultiple: 6,
          baseMultiple: 8,
          bullMultiple: 10,
        },
      ],
      netCashB: -100,
      dilutedSharesM: 1000,
      holdingDiscountPct: 25,
      currentPrice: 20,
      horizonYears: 3,
    });
    expect(negSotp.baseEquityB).toBe(-60);
    expect(negSotp.baseTargetPrice).toBe(0);

    const lowRonic = calculateTrueReverseDcf({
      currentPrice: 120,
      baseMetricPerShare: 5,
      horizonYears: 5,
      hurdleRatePct: 12,
      terminalMultiple: 18,
      ronicPct: 18,
    });
    expect(Number.isFinite(lowRonic.requiredCagrPct)).toBe(true);
    expect(lowRonic.requiredCagrPct).toBeGreaterThan(-40);
    expect(lowRonic.requiredCagrPct).toBeLessThan(150);

    const netCashRich = calculateEvOwnerFcfValuation({
      currentPrice: 10,
      dilutedSharesM: 1000,
      cashB: 25,
      totalDebtB: 5,
      bearOwnerFcfB: 0.5,
      baseOwnerFcfB: 1,
      bullOwnerFcfB: 1.5,
      bearEvMultiple: 10,
      baseEvMultiple: 15,
      bullEvMultiple: 20,
      horizonYears: 3,
    });
    expect(netCashRich).not.toBeNull();
    expect(netCashRich?.currentEvB).toBeLessThan(0);
  });

  it("supports explicit D&A, maintenance/growth CapEx, ΔNWC, independent multiples, and optional cash-SBC drag while staying backward-compatible with legacy drafts", () => {
    const legacyDrivers = {
      bear: {
        revenueCagrPct: 8,
        targetOperatingMarginPct: 25,
        sbcPctOfRev: 3,
        taxRatePct: 20,
        capexPctOfRev: 10,
        annualShareChangePct: 0.5,
        terminalMultiple: 16,
      },
      base: {
        revenueCagrPct: 12,
        targetOperatingMarginPct: 30,
        sbcPctOfRev: 2.5,
        taxRatePct: 18,
        capexPctOfRev: 10,
        annualShareChangePct: -1,
        terminalMultiple: 22,
      },
      bull: {
        revenueCagrPct: 18,
        targetOperatingMarginPct: 34,
        sbcPctOfRev: 2,
        taxRatePct: 17,
        capexPctOfRev: 9,
        annualShareChangePct: -2,
        terminalMultiple: 26,
      },
      cashRetentionPct: 70,
    };
    const common = {
      currentPrice: 100,
      currentRevenueB: 50,
      currentSharesM: 1000,
      cashB: 10,
      totalDebtB: 5,
      horizonYears: 3,
    };
    const legacyRes = calculateLinkedOperatingModel({ ...common, drivers: legacyDrivers });
    // Hand check base year 3 rev = 50 * 1.12^3 = 70.2464; EBIT = 21.07392; NOPAT = 17.2806;
    // Legacy parity: D&A(6.5%) - MaintCapEx(10%) = -3.5% * rev = -2.4586 => Owner FCF = 14.822B
    expect(legacyRes.base.endingOwnerFcfB).toBeCloseTo(14.82, 1);
    expect(legacyRes.base.endingGrowthCapexB).toBe(0);

    const explicitRes = calculateLinkedOperatingModel({
      ...common,
      drivers: {
        ...legacyDrivers,
        treatSbcAsCashCost: true,
        base: {
          ...legacyDrivers.base,
          daPctOfRev: 6,
          maintenanceCapexPctOfRev: 4,
          nwcPctOfIncrementalRev: 10,
          peMultiple: 18,
          evFcfMultiple: 24,
          evEbitMultiple: 15,
        },
      },
    });
    expect(explicitRes.base.endingGrowthCapexB).toBeGreaterThan(4);
    expect(explicitRes.base.peTargetPrice).not.toBe(legacyRes.base.peTargetPrice);
    expect(explicitRes.base.evFcfTargetPrice).not.toBe(legacyRes.base.evFcfTargetPrice);
    expect(explicitRes.base.evEbitTargetPrice).not.toBe(legacyRes.base.evEbitTargetPrice);
  });
});
