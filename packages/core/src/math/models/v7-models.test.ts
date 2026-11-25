import { describe, expect, it } from "vitest";
import { calculateCognitiveCalibration } from "../institutional/cognitive-calibration";
import { calculateTrueReverseDcf } from "../valuation-advanced";
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
    expect(report.brierScore).not.toBeNull();
    expect(report.avgBenchmarkAlphaPct).toBe(10);
  });
});
