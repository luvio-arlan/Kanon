import { describe, expect, it } from "vitest";
import type { MarketQuoteSnapshot } from "../../contracts/market-contracts";
import type { QuarterlyReview, ThesisDetail } from "../../schemas/research";
import { calculateValuationScenarios } from "../valuation-scenarios";
import { calculateCognitiveCalibration } from "./cognitive-calibration";
import { calculatePeerCompsTable } from "./peer-comps";

function makeThesis(overrides: Partial<ThesisDetail> = {}): ThesisDetail {
  const valInput = {
    currentPrice: 100,
    horizonYears: 3,
    bear: { eps: 6, peMultiple: 12, probability: 0.25 },
    base: { eps: 10, peMultiple: 18, probability: 0.5 },
    bull: { eps: 13, peMultiple: 22, probability: 0.25 },
  };
  return {
    id: "t-1",
    indexLabel: "01",
    ticker: "MU",
    companyName: "美光科技",
    sectorTag: "AI 存储",
    currentPrice: 100,
    lastReviewedAt: "刚刚",
    horizonLabel: "3 年周期",
    horizonYears: 3,
    portfolioRole: "starter",
    currentWeightPct: 6,
    targetMaxWeightPct: 12,
    avgCostBasis: 92,
    convictionSummary: "HBM3E 驱动结构性毛利中枢上移",
    status: "active",
    businessFilter: {
      recurringRevenue: "pass",
      pricingPower: "pass",
      capitalReturn: "pass",
      governance: "pass",
      notes: "ok",
      vetoReason: "",
      consensusView: "cycle",
      variantPerception: "structural shift",
      keyDebate: "margin durability",
      preMortem: "capex slump",
    },
    hypotheses: [
      {
        id: "h1",
        title: "H1",
        metricLabel: "M1",
        threshold: ">20%",
        status: "validated",
        note: "ok",
      },
      {
        id: "h2",
        title: "H2",
        metricLabel: "M2",
        threshold: ">40%",
        status: "watching",
        note: "ok",
      },
      {
        id: "h3",
        title: "H3",
        metricLabel: "M3",
        threshold: "<20%",
        status: "watching",
        note: "ok",
      },
    ],
    catalysts: [
      {
        id: "c1",
        title: "Q4 Earnings",
        dateLabel: "2026-12",
        category: "earnings",
        impact: "high",
        direction: "bullish",
        status: "upcoming",
        verificationMetric: "GM > 45%",
        note: "",
      },
    ],
    crossChecks: [],
    valuationInput: valInput,
    valuationModelMode: "pe",
    valuationDriverInputs: null,
    valuation: calculateValuationScenarios(valInput),
    priceHistory: [
      { label: "Start", price: 90 },
      { label: "Now", price: 100 },
    ],
    disciplineEntries: [
      {
        id: "d1",
        action: "buy",
        noLeverageConfirmed: true,
        positionCapConfirmed: true,
        exitRule: "GM < 38%",
        emotion: "calm",
        priceAnchor: 80,
        note: "calm buy",
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Institutional v5 Math: Cognitive Calibration & Peer Comps", () => {
  it("computes decision alpha, zero-leverage compliance, and quarterly verdict accuracy", () => {
    const thesis = makeThesis();
    const reviews: QuarterlyReview[] = [
      {
        id: "rev-1",
        thesisId: "t-1",
        quarterLabel: "FY26 Q3",
        summary: "Margin beat",
        hypothesisVerdicts: [
          { hypothesisId: "h1", title: "H1", verdict: "strengthened", evidence: "ok" },
          { hypothesisId: "h2", title: "H2", verdict: "unchanged", evidence: "ok" },
        ],
        priceAtReview: 96,
        baseTargetAtReview: 180,
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ];
    const report = calculateCognitiveCalibration(thesis, reviews, 108);
    expect(report.zeroLeverageCompliancePct).toBe(100);
    expect(report.calmDecisionPct).toBe(100);
    expect(report.favorableDecisionRatePct).toBe(100);
    expect(report.avgEntryReturnPct).toBe(35);
    expect(report.strengthenedRatePct).toBe(50);
    expect(report.calibrationScore).toBeGreaterThanOrEqual(80);
    expect(report.calibrationLabel).toBe("高纪律校准");
  });

  it("computes peer comps table with live extended-hours prices and portfolio medians", () => {
    const mu = makeThesis({ id: "t-mu", ticker: "MU" });
    const nvda = makeThesis({
      id: "t-nvda",
      ticker: "NVDA",
      companyName: "英伟达",
      currentWeightPct: 14,
    });
    const quote: MarketQuoteSnapshot = {
      ticker: "MU",
      currency: "USD",
      sessionState: "PRE",
      regularPrice: 100,
      previousClose: 98,
      regularChange: 2,
      regularChangePct: 2.04,
      preMarketPrice: 105,
      preMarketChange: 5,
      preMarketChangePct: 5,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePct: null,
      effectivePrice: 105,
      dayHigh: 102,
      dayLow: 97,
      fiftyTwoWeekHigh: 150,
      fiftyTwoWeekLow: 70,
      fiftyTwoWeekPositionPct: 43.8,
      volume: 1000000,
      source: "yahoo",
      tier: "free",
      asOf: "2026-11-24T12:00:00.000Z",
      latencyMs: 120,
    };

    const comps = calculatePeerCompsTable([mu, nvda], { MU: quote });
    expect(comps.rows).toHaveLength(2);
    expect(comps.rows[0]?.livePrice).toBe(105);
    expect(comps.rows[0]?.sessionState).toBe("PRE");
    expect(comps.rows[0]?.drawdownFrom52wHighPct).toBe(-30);
    expect(comps.rows[0]?.upcomingCatalysts).toBe(1);
    expect(comps.rows[0]?.upsidePct).toBe(71.4);
    expect(comps.medians.upsidePct).toBe(75.7);
  });
});
