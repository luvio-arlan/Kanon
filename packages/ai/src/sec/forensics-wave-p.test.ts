import type { SecAnnualFinancial } from "@kanon/core";
import { calculateAltmanZScore, calculateBeneishMScore } from "@kanon/core";
import { describe, expect, it } from "vitest";
import {
  extractAnnualHistory,
  resolveCurrencyNormalization,
  type SecFactsPayload,
} from "./edgar-annuals";

function num(v: number | null | undefined): number {
  return v ?? 0;
}

function buildBeneishInput(row: SecAnnualFinancial) {
  return {
    revenue: num(row.revenue),
    costOfRevenue: num(row.revenue) - num(row.grossProfit),
    sgaExpense: num(row.sgaExpense),
    depreciation: num(row.depreciation),
    netIncome: num(row.netIncome),
    operatingCashFlow: num(row.operatingCashFlow),
    accountsReceivable: num(row.accountsReceivable),
    currentAssets: num(row.currentAssets),
    ppeNet: num(row.ppeNet),
    totalAssets: num(row.totalAssets),
    currentLiabilities: num(row.currentLiabilities),
    longTermDebt: num(row.totalDebt),
  };
}

function assertAaplAltmanAndBeneish(fy23: SecAnnualFinancial, fy24: SecAnnualFinancial) {
  const altman = calculateAltmanZScore({
    workingCapital: num(fy24.currentAssets) - num(fy24.currentLiabilities),
    retainedEarnings: num(fy24.retainedEarnings),
    ebit: num(fy24.operatingIncome),
    marketCap: 230 * num(fy24.sharesOutstanding),
    bookEquity: num(fy24.stockholdersEquity),
    totalLiabilities: num(fy24.totalLiabilities),
    revenue: num(fy24.revenue),
    totalAssets: num(fy24.totalAssets),
  });
  expect(altman.applicable).toBe(true);
  if (altman.applicable) {
    expect(altman.score).toBeCloseTo(1.87, 1);
    expect(altman.zone).toBe("grey");
  }
  const beneish = calculateBeneishMScore(buildBeneishInput(fy24), buildBeneishInput(fy23));
  expect(beneish.components.depi).not.toBe(1);
}

describe("Wave P2 Real XBRL Balance Sheet Extraction & Honest Forensics", () => {
  it("extracts AAPL FY2024 real balance sheet tags (Assets, CurrentLiabilities, negative RetainedEarnings, D&A, SGA)", () => {
    const facts: SecFactsPayload = {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                start: "2022-09-25",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 383.285e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                start: "2023-10-01",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 391.035e9,
              },
            ],
          },
        },
        GrossProfit: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                start: "2022-09-25",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 169.148e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                start: "2023-10-01",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 180.683e9,
              },
            ],
          },
        },
        OperatingIncomeLoss: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                start: "2022-09-25",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 114.301e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                start: "2023-10-01",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 123.216e9,
              },
            ],
          },
        },
        NetIncomeLoss: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                start: "2022-09-25",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 96.995e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                start: "2023-10-01",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 93.736e9,
              },
            ],
          },
        },
        NetCashProvidedByUsedInOperatingActivities: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                start: "2022-09-25",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 110.543e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                start: "2023-10-01",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 118.254e9,
              },
            ],
          },
        },
        Assets: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 352.583e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 364.98e9,
              },
            ],
          },
        },
        AssetsCurrent: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 143.566e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 152.987e9,
              },
            ],
          },
        },
        LiabilitiesCurrent: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 145.308e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 176.392e9,
              },
            ],
          },
        },
        Liabilities: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 290.437e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 308.03e9,
              },
            ],
          },
        },
        StockholdersEquity: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 62.146e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 56.95e9,
              },
            ],
          },
        },
        RetainedEarningsAccumulatedDeficit: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: -0.214e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: -19.154e9,
              },
            ],
          },
        },
        PropertyPlantAndEquipmentNet: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 43.715e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 45.68e9,
              },
            ],
          },
        },
        DepreciationDepletionAndAmortization: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                start: "2022-09-25",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 11.519e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                start: "2023-10-01",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 11.445e9,
              },
            ],
          },
        },
        SellingGeneralAndAdministrativeExpense: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                start: "2022-09-25",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 24.932e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                start: "2023-10-01",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 26.097e9,
              },
            ],
          },
        },
        AccountsReceivableNetCurrent: {
          units: {
            USD: [
              {
                fy: 2023,
                fp: "FY",
                form: "10-K",
                end: "2023-09-30",
                filed: "2023-11-03",
                val: 29.508e9,
              },
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                end: "2024-09-28",
                filed: "2024-11-01",
                val: 33.41e9,
              },
            ],
          },
        },
      },
      dei: {
        EntityCommonStockSharesOutstanding: {
          units: {
            shares: [
              {
                fy: 2024,
                fp: "FY",
                form: "10-K",
                end: "2024-10-18",
                filed: "2024-11-01",
                val: 15.115e9,
              },
            ],
          },
        },
      },
    };
    const annuals = extractAnnualHistory(facts, resolveCurrencyNormalization(facts, "AAPL"));
    const fy23 = annuals[0];
    const fy24 = annuals[1];
    expect(fy23).toBeDefined();
    expect(fy24).toBeDefined();
    if (!fy23 || !fy24) return;
    expect(fy24.totalAssets).toBeCloseTo(364.98e9, -6);
    expect(fy24.currentLiabilities).toBeCloseTo(176.392e9, -6);
    expect(fy24.retainedEarnings).toBeLessThan(0);
    expect(fy24.sharesOutstanding).toBeCloseTo(15.115e9, -6);
    expect(fy24.depreciation).toBeCloseTo(11.445e9, -6);
    assertAaplAltmanAndBeneish(fy23, fy24);
  });
});
