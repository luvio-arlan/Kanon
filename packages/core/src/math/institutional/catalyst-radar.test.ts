import { describe, expect, it } from "vitest";
import type { ThesisDetail } from "../../schemas/research";
import { calculateValuationScenarios } from "../valuation-scenarios";
import { evaluatePortfolioReviewRadar, parseCatalystSortKey } from "./catalyst-radar";

function makeThesis(overrides: Partial<ThesisDetail>): ThesisDetail {
  const valInput = {
    currentPrice: 140,
    horizonYears: 3,
    bear: { eps: 4, peMultiple: 22, probability: 0.25 },
    base: { eps: 6.5, peMultiple: 30, probability: 0.5 },
    bull: { eps: 8.5, peMultiple: 35, probability: 0.25 },
  };
  return {
    id: "t-1",
    indexLabel: "01",
    ticker: "NVDA",
    companyName: "英伟达",
    sectorTag: "AI 算力",
    currentPrice: 140,
    lastReviewedAt: "11/24",
    horizonLabel: "3 年周期",
    horizonYears: 3,
    convictionSummary: "CUDA 生态壁垒",
    status: "active",
    portfolioRole: "core",
    currentWeightPct: 15,
    targetMaxWeightPct: 20,
    avgCostBasis: 110,
    businessFilter: {
      recurringRevenue: "pass",
      pricingPower: "pass",
      capitalReturn: "pass",
      governance: "pass",
      notes: "生态壁垒",
      vetoReason: "",
      consensusView: "",
      variantPerception: "",
      keyDebate: "",
      preMortem: "",
    },
    hypotheses: [
      {
        id: "h-1",
        title: "数据中心毛利率维持 72% 以上",
        metricLabel: "毛利率",
        threshold: ">=72%",
        status: "validated",
        note: "最新财报达标",
      },
    ],
    crossChecks: [],
    catalysts: [],
    valuationInput: valInput,
    valuationModelMode: "pe",
    valuationDriverInputs: null,
    valuation: calculateValuationScenarios(valInput),
    priceHistory: [],
    disciplineEntries: [],
    updatedAt: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("Portfolio Catalyst Chronology & Review Drift Radar", () => {
  it("parses date labels into chronological sort keys", () => {
    expect(parseCatalystSortKey("2026-05-20")).toBe(20260520);
    expect(parseCatalystSortKey("2026-Q1")).toBeLessThan(parseCatalystSortKey("2026-Q3"));
    expect(parseCatalystSortKey("FY26 Q4")).toBeLessThan(parseCatalystSortKey("2027-02-01"));
    expect(parseCatalystSortKey("待定")).toBe(99991231);
  });

  it("prioritizes warning hypotheses and stale theses ahead of imminent catalysts and healthy items", () => {
    const now = "2026-11-24T00:00:00.000Z";
    const report = evaluatePortfolioReviewRadar(
      [
        makeThesis({ id: "t-ok", ticker: "MSFT", updatedAt: "2026-11-22T00:00:00.000Z" }),
        makeThesis({
          id: "t-stale",
          ticker: "MU",
          updatedAt: "2026-09-01T00:00:00.000Z",
        }),
        makeThesis({
          id: "t-warn",
          ticker: "TSM",
          hypotheses: [
            {
              id: "h-w",
              title: "CoWoS 产能",
              metricLabel: "CapEx",
              threshold: ">35B",
              status: "warning",
              note: "出现偏离",
            },
          ],
        }),
        makeThesis({
          id: "t-cat",
          ticker: "NVDA",
          catalysts: [
            {
              id: "c-1",
              title: "Q3 财报",
              dateLabel: "2026-11-26",
              category: "earnings",
              impact: "high",
              direction: "binary",
              status: "upcoming",
              verificationMetric: "毛利率指引",
              note: "",
            },
          ],
        }),
      ],
      now,
      30,
    );

    expect(report.warningCount).toBe(1);
    expect(report.staleCount).toBe(1);
    expect(report.upcomingHighImpactCount).toBe(1);
    expect(report.items.map((i) => i.ticker)).toEqual(["MU", "TSM", "NVDA", "MSFT"]);
    expect(report.items[0]?.level).toBe("urgent_review");
    expect(report.items[1]?.level).toBe("urgent_review");
    expect(report.items[2]?.level).toBe("catalyst_imminent");
    expect(report.items[3]?.level).toBe("healthy");
  });
});
