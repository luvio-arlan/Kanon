import { describe, expect, it } from "vitest";
import type { QuarterlyReview, ThesisDetail } from "../../schemas/research";
import { calculateValuationScenarios } from "../valuation-scenarios";
import { calculatePortfolioCalibration } from "./portfolio-calibration";
import { buildWeeklyIcDigest, formatWeeklyDigestMarkdown } from "./weekly-digest";

function makeSampleThesis(): ThesisDetail {
  const valuationInput = {
    currentPrice: 100,
    horizonYears: 3,
    bear: { eps: 6, peMultiple: 12, probability: 0.25 },
    base: { eps: 10, peMultiple: 18, probability: 0.5 },
    bull: { eps: 13, peMultiple: 22, probability: 0.25 },
  };
  return {
    id: "t-mu",
    indexLabel: "01",
    ticker: "MU",
    companyName: "美光科技",
    sectorTag: "AI 存储",
    currentPrice: 100,
    lastReviewedAt: "刚刚",
    horizonLabel: "3 年周期",
    horizonYears: 3,
    portfolioRole: "core",
    currentWeightPct: 12,
    targetMaxWeightPct: 15,
    avgCostBasis: 85,
    convictionSummary: "HBM3E 提升行业盈利中枢。",
    status: "active",
    businessFilter: {
      recurringRevenue: "pass",
      pricingPower: "pass",
      capitalReturn: "pass",
      governance: "pass",
      notes: "",
      vetoReason: "",
      consensusView: "周期股",
      variantPerception: "结构上移",
      keyDebate: "供需差",
      preMortem: "扩产超预期",
    },
    hypotheses: [
      {
        id: "h-1",
        title: "HBM 市占率突破 25%",
        metricLabel: "HBM Share",
        threshold: "< 20%",
        status: "validated",
        note: "良率持续爬坡",
      },
      {
        id: "h-2",
        title: "毛利率站稳 40%",
        metricLabel: "Gross Margin",
        threshold: "< 35%",
        status: "watching",
        note: "观察价格走势",
      },
      {
        id: "h-3",
        title: "资本开支纪律受控",
        metricLabel: "CapEx/Rev",
        threshold: "> 45%",
        status: "warning",
        note: "警惕同业激进扩产",
      },
    ],
    catalysts: [
      {
        id: "cat-1",
        title: "Q4 财报指引",
        dateLabel: "2026-09-25",
        category: "earnings",
        impact: "high",
        direction: "bullish",
        status: "upcoming",
        verificationMetric: "HBM 营收占比 > 30%",
        note: "关注 ASP 指导",
      },
    ],
    crossChecks: [],
    valuationInput,
    valuationModelMode: "pe",
    valuationDriverInputs: null,
    valuation: calculateValuationScenarios(valuationInput),
    priceHistory: [],
    disciplineEntries: [
      {
        id: "de-calm",
        action: "buy",
        noLeverageConfirmed: true,
        positionCapConfirmed: true,
        exitRule: "HBM < 20%",
        emotion: "calm",
        priceAnchor: 80,
        note: "低位建仓",
        createdAt: "2026-06-01T00:00:00Z",
      },
      {
        id: "de-fomo",
        action: "add",
        noLeverageConfirmed: true,
        positionCapConfirmed: true,
        exitRule: "HBM < 20%",
        emotion: "fomo",
        priceAnchor: 120,
        note: "追高加仓",
        createdAt: "2026-07-01T00:00:00Z",
      },
    ],
    updatedAt: "2026-08-15T00:00:00Z",
  };
}

describe("Portfolio calibration & Weekly IC Digest", () => {
  it("computes emotion attribution and position efficiency across theses", () => {
    const sample = makeSampleThesis();
    const reviewsMap = new Map<string, readonly QuarterlyReview[]>([
      [
        sample.id,
        [
          {
            id: "rev-1",
            thesisId: sample.id,
            quarterLabel: "FY26Q3",
            summary: "HBM 供需保持紧张",
            hypothesisVerdicts: [
              {
                hypothesisId: "h-1",
                title: "HBM 市占率突破 25%",
                verdict: "strengthened",
                evidence: "10-Q 披露份额提升",
              },
            ],
            priceAtReview: 100,
            baseTargetAtReview: sample.valuation.base.targetPrice,
            createdAt: "2026-08-01T00:00:00Z",
          },
        ],
      ],
    ]);

    const report = calculatePortfolioCalibration([sample], reviewsMap);
    expect(report.totalDecisionCount).toBe(2);
    expect(report.zeroLeverageCompliancePct).toBe(100);
    expect(report.calmSharePct).toBe(50);
    expect(report.overallWinRatePct).toBe(50);
    expect(report.verdictSummary.strengthenedCount).toBe(1);
    const calmRow = report.emotionBreakdown.find((r) => r.emotion === "calm");
    const fomoRow = report.emotionBreakdown.find((r) => r.emotion === "fomo");
    expect(calmRow?.winRatePct).toBe(100);
    expect(fomoRow?.winRatePct).toBe(0);
    expect(report.positionRows[0]?.unrealisedReturnPct).toBe(17.6);

    const digest = buildWeeklyIcDigest([sample], report, new Date("2026-09-01T00:00:00Z"));
    expect(digest.activeCount).toBe(1);
    expect(digest.warningHypotheses).toHaveLength(1);
    const md = formatWeeklyDigestMarkdown(digest);
    expect(md).toContain("KANON IC 投研周报");
    expect(md).toContain("MU");
  });
});
