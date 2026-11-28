import { describe, expect, it } from "vitest";
import { calculateEquityBridge, calculateTsmOptionDilution } from "./equity-bridge";
import { calculateMultiStageFcffDcf } from "./fcff-dcf";
import { evaluateValueAtCapYears, solveMauboussinImpliedCap } from "./reverse-dcf-cap";
import { calculateWacc } from "./wacc";

describe("Institutional DCF, WACC, Equity Bridge & Mauboussin CAP (W2.1-W2.2)", () => {
  it("computes Damodaran-standard market-value-weighted WACC", () => {
    const res = calculateWacc({
      riskFreeRatePct: 4.25,
      equityRiskPremiumPct: 5.0,
      beta: 1.15,
      preTaxCostOfDebtPct: 5.5,
      marginalTaxRatePct: 21,
      marketCapB: 800,
      totalDebtB: 150,
      leaseDebtB: 50,
    });
    expect(res.costOfEquityPct).toBe(10);
    expect(res.afterTaxCostOfDebtPct).toBeCloseTo(4.35, 2);
    expect(res.equityWeightPct).toBe(80);
    expect(res.debtWeightPct).toBe(20);
    expect(res.waccPct).toBeCloseTo(8.87, 2);
  });

  it("applies Treasury Stock Method (TSM) dilution and full EV->Equity claims bridge", () => {
    const tsm = calculateTsmOptionDilution(
      [
        { sharesM: 20, strikePrice: 50 }, // ITM at $100 -> 10M net dilution
        { sharesM: 10, strikePrice: 120 }, // OTM -> 0 dilution
      ],
      100,
    );
    expect(tsm).toBe(10);

    const bridge = calculateEquityBridge({
      enterpriseValueB: 120,
      cashAndStInvestmentsB: 15,
      totalDebtB: 20,
      operatingLeaseLiabilitiesB: 3,
      preferredStockB: 1,
      minorityInterestB: 1,
      basicSharesM: 980,
      optionGrants: [{ sharesM: 20, strikePrice: 50 }],
      rsuSharesM: 10,
      assumedSharePrice: 100,
    });
    expect(bridge.equityValueB).toBe(110);
    expect(bridge.dilutedSharesM).toBe(1000);
    expect(bridge.fairValuePerShare).toBe(110);
  });

  it("computes 3-stage value-driver FCFF DCF and enforces WACC > g_terminal", () => {
    const res = calculateMultiStageFcffDcf({
      baseRevenueB: 100,
      highGrowthYears: 5,
      fadeYears: 5,
      initialRevenueGrowthPct: 14,
      terminalGrowthPct: 3,
      initialEbitMarginPct: 28,
      terminalEbitMarginPct: 30,
      effectiveTaxRatePct: 21,
      salesToCapitalRatio: 2.0,
      terminalRonicPct: 18,
      waccPct: 9,
      cashAndStInvestmentsB: 30,
      totalDebtB: 20,
      basicSharesM: 1000,
      assumedSharePrice: 400,
    });
    expect(res.schedule).toHaveLength(10);
    expect(res.terminalReinvestmentRatePct).toBeCloseTo(16.7, 1);
    expect(res.enterpriseValueB).toBeGreaterThan(res.pvExplicitFcffB);
    expect(res.fairValuePerShare).toBeGreaterThan(300);

    expect(() =>
      calculateMultiStageFcffDcf({
        baseRevenueB: 100,
        highGrowthYears: 3,
        fadeYears: 2,
        initialRevenueGrowthPct: 10,
        terminalGrowthPct: 9,
        initialEbitMarginPct: 20,
        terminalEbitMarginPct: 20,
        effectiveTaxRatePct: 21,
        salesToCapitalRatio: 2,
        terminalRonicPct: 15,
        waccPct: 9,
        cashAndStInvestmentsB: 10,
        totalDebtB: 5,
        basicSharesM: 100,
        assumedSharePrice: 100,
      }),
    ).toThrow(/WACC/);

    // Damodaran g <= Rf constraint & value-destroying RONIC < WACC support
    expect(() =>
      calculateMultiStageFcffDcf({
        baseRevenueB: 100,
        highGrowthYears: 3,
        fadeYears: 2,
        initialRevenueGrowthPct: 10,
        terminalGrowthPct: 5,
        riskFreeRatePct: 4.25,
        initialEbitMarginPct: 20,
        terminalEbitMarginPct: 20,
        effectiveTaxRatePct: 21,
        salesToCapitalRatio: 2,
        terminalRonicPct: 15,
        waccPct: 9,
        cashAndStInvestmentsB: 10,
        totalDebtB: 5,
        basicSharesM: 100,
        assumedSharePrice: 100,
      }),
    ).toThrow(/无风险利率/);

    const destroying = calculateMultiStageFcffDcf({
      baseRevenueB: 100,
      highGrowthYears: 5,
      fadeYears: 5,
      initialRevenueGrowthPct: 10,
      terminalGrowthPct: 3,
      initialEbitMarginPct: 20,
      terminalEbitMarginPct: 20,
      effectiveTaxRatePct: 21,
      salesToCapitalRatio: 2,
      terminalRonicPct: 5,
      waccPct: 9,
      cashAndStInvestmentsB: 10,
      totalDebtB: 5,
      basicSharesM: 1000,
      assumedSharePrice: 100,
    });
    expect(destroying.valueDestroyingGrowth).toBe(true);
    expect(destroying.terminalReinvestmentRatePct).toBeCloseTo(60, 1);
  });

  it("recovers exact Mauboussin Competitive Advantage Period (CAP) years via bisection", () => {
    const targetEv = evaluateValueAtCapYears(10, 0.15, 0.3, 0.09, 8.5);
    const solved = solveMauboussinImpliedCap({
      currentValue: targetEv,
      baseNopat: 10,
      growthRatePct: 15,
      ronicPct: 30,
      waccPct: 9,
    });
    expect(solved.impliedCapYears).toBeCloseTo(8.5, 1);
    expect(solved.pvOfGrowthOptions).toBeGreaterThan(0);
    expect(solved.exceedsMaxCap).toBe(false);
  });
});
