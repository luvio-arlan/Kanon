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
  });
});
