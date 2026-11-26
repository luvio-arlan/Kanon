import { describe, expect, it } from "vitest";
import { analyzeSecForensics } from "../sec-forensics";

describe("SEC Forensics v2: Working Capital Cycle & Capital Allocation", () => {
  it("computes DSO, DIO, DPO, CCC, NWC%, and OCF capital allocation accurately", () => {
    const report = analyzeSecForensics([
      {
        fiscalYear: "FY2025",
        revenue: 100_000_000_000,
        grossProfit: 60_000_000_000,
        grossMarginPct: 60,
        costOfRevenue: 40_000_000_000,
        operatingIncome: 45_000_000_000,
        netIncome: 38_000_000_000,
        operatingCashFlow: 42_000_000_000,
        capex: 4_200_000_000,
        sbc: 3_000_000_000,
        freeCashFlow: 37_800_000_000,
        dilutedEps: 3.8,
        accountsReceivable: 10_000_000_000,
        inventory: 4_000_000_000,
        accountsPayable: 5_000_000_000,
        shareRepurchases: 12_600_000_000,
        dividendsPaid: 2_100_000_000,
        cashAndEquiv: 20_000_000_000,
        totalDebt: 8_000_000_000,
        stockholdersEquity: 50_000_000_000,
      },
    ]);

    expect(report).not.toBeNull();
    expect(report?.workingCapitalCycle.dsoDays).toBe(36.5);
    expect(report?.workingCapitalCycle.dioDays).toBe(36.5);
    expect(report?.workingCapitalCycle.dpoDays).toBe(45.6);
    expect(report?.workingCapitalCycle.cashConversionCycleDays).toBe(27.4);
    expect(report?.workingCapitalCycle.nwcPctOfRevenue).toBe(9);
    expect(report?.capitalAllocation.capexPctOfOcf).toBe(10);
    expect(report?.capitalAllocation.buybackPctOfOcf).toBe(30);
    expect(report?.capitalAllocation.dividendPctOfOcf).toBe(5);
    expect(report?.effectiveTaxRateSource).toBe("statutory-fallback");
    expect(report?.effectiveTaxRatePct).toBe(21);
  });

  it("matches hand-calculated ROIC (incl/excl goodwill) with effective tax, leases, and 2% operating cash for MSFT, COST, TSM (< 0.5pp)", () => {
    const msft = analyzeSecForensics([
      {
        fiscalYear: "FY2024",
        revenue: 245_122e6,
        grossProfit: 171_008e6,
        grossMarginPct: 69.8,
        operatingIncome: 109_433e6,
        pretaxIncome: 107_787e6,
        incomeTaxExpense: 19_651e6,
        netIncome: 88_136e6,
        operatingCashFlow: 118_548e6,
        capex: 44_477e6,
        freeCashFlow: 74_071e6,
        dilutedEps: 11.8,
        cashAndEquiv: 75_543e6,
        totalDebt: 51_608e6,
        operatingLeaseLiability: 15_497e6,
        goodwill: 119_220e6,
        stockholdersEquity: 268_477e6,
      },
    ]);
    expect(msft?.effectiveTaxRateSource).toBe("effective");
    expect(msft?.effectiveTaxRatePct).toBeCloseTo(18.2, 1);
    expect(Math.abs((msft?.roicPct ?? 0) - 33.8)).toBeLessThan(0.5);
    expect(Math.abs((msft?.roicExGoodwillPct ?? 0) - 61.4)).toBeLessThan(0.5);

    const cost = analyzeSecForensics([
      {
        fiscalYear: "FY2024",
        revenue: 254_453e6,
        grossProfit: 32_155e6,
        grossMarginPct: 12.6,
        operatingIncome: 9_285e6,
        pretaxIncome: 9_740e6,
        incomeTaxExpense: 2_373e6,
        netIncome: 7_367e6,
        operatingCashFlow: 11_339e6,
        capex: 4_710e6,
        freeCashFlow: 6_629e6,
        dilutedEps: 16.56,
        cashAndEquiv: 11_068e6,
        totalDebt: 5_897e6,
        operatingLeaseLiability: 2_375e6,
        goodwill: 994e6,
        stockholdersEquity: 23_622e6,
      },
    ]);
    expect(cost?.effectiveTaxRateSource).toBe("effective");
    expect(cost?.effectiveTaxRatePct).toBeCloseTo(24.4, 1);
    expect(Math.abs((cost?.roicPct ?? 0) - 27.1)).toBeLessThan(0.5);
    expect(Math.abs((cost?.roicExGoodwillPct ?? 0) - 28.2)).toBeLessThan(0.5);

    const tsm = analyzeSecForensics([
      {
        fiscalYear: "FY2024",
        revenue: 90_080e6,
        grossProfit: 50_535e6,
        grossMarginPct: 56.1,
        operatingIncome: 41_160e6,
        pretaxIncome: 43_620e6,
        incomeTaxExpense: 6_720e6,
        netIncome: 36_900e6,
        operatingCashFlow: 56_800e6,
        capex: 29_800e6,
        freeCashFlow: 27_000e6,
        dilutedEps: 7.1,
        cashAndEquiv: 74_200e6,
        totalDebt: 30_500e6,
        operatingLeaseLiability: 1_100e6,
        goodwill: 0,
        stockholdersEquity: 131_800e6,
      },
    ]);
    expect(tsm?.effectiveTaxRateSource).toBe("effective");
    expect(tsm?.effectiveTaxRatePct).toBeCloseTo(15.4, 1);
    expect(Math.abs((tsm?.roicPct ?? 0) - 38.3)).toBeLessThan(0.5);
    expect(tsm?.roicExGoodwillPct).toBe(tsm?.roicPct);
  });
});
