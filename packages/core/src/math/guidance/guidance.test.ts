import { describe, expect, it } from "vitest";
import type { GuidanceCommitment } from "../../contracts/intel";
import { computeGuidanceCredibility, scoreGuidanceOutcome } from "./index";

function makeItem(overrides: Partial<GuidanceCommitment>): GuidanceCommitment {
  return {
    id: "gc-1",
    thesisId: "t-1",
    securityId: "s-1",
    createdBy: "u-1",
    metric: "revenue",
    customLabel: null,
    basis: "gaap",
    unit: "usd",
    currency: "USD",
    targetFiscalYear: 2025,
    targetFiscalPeriod: "FY",
    targetPeriodEnd: "2025-12-31",
    issuedOn: "2025-02-01",
    low: 100e9,
    high: 110e9,
    sourceKind: "research_note",
    sourceRef: "n-1",
    sourceUrl: null,
    quote: "We guide revenue to $100B-$110B.",
    status: "confirmed",
    supersedesId: null,
    confirmedBy: "u-1",
    confirmedAt: "2025-02-02T00:00:00.000Z",
    actualValue: 112e9,
    outcome: "beat",
    surprise: 6.67,
    resolvedAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("R3 Guidance Scoring & Credibility", () => {
  it("scores range, point tolerance, and inverted capex/opex direction accurately", () => {
    expect(
      scoreGuidanceOutcome({ metric: "revenue", unit: "usd", low: 100, high: 110, actual: 115 })
        .outcome,
    ).toBe("beat");
    expect(
      scoreGuidanceOutcome({ metric: "revenue", unit: "usd", low: 100, high: 110, actual: 105 })
        .outcome,
    ).toBe("in_line");
    expect(
      scoreGuidanceOutcome({ metric: "revenue", unit: "usd", low: 100, high: 110, actual: 95 })
        .outcome,
    ).toBe("miss");
    // Operating expenses lower than guided = beat; CapEx is neutral (deviation either way = miss)
    expect(
      scoreGuidanceOutcome({
        metric: "operating_expenses",
        unit: "usd",
        low: 10,
        high: 12,
        actual: 9,
      }).outcome,
    ).toBe("beat");
    expect(
      scoreGuidanceOutcome({
        metric: "operating_expenses",
        unit: "usd",
        low: 10,
        high: 12,
        actual: 15,
      }).outcome,
    ).toBe("miss");
    expect(
      scoreGuidanceOutcome({ metric: "capex", unit: "usd", low: 10, high: 12, actual: 9 }).outcome,
    ).toBe("miss");
    expect(
      scoreGuidanceOutcome({ metric: "capex", unit: "usd", low: 10, high: 12, actual: 11 }).outcome,
    ).toBe("in_line");
    expect(
      scoreGuidanceOutcome({ metric: "gross_margin", unit: "pct", low: 70, high: 70, actual: 70.1 })
        .outcome,
    ).toBe("in_line");
  });

  it("hides keptRatio below N=4 and classifies style strictly at N>=6", () => {
    const small = computeGuidanceCredibility([
      makeItem({ id: "1", targetFiscalPeriod: "Q1" }),
      makeItem({ id: "2", targetFiscalPeriod: "Q2" }),
      makeItem({ id: "3", targetFiscalPeriod: "Q3" }),
    ]);
    expect(small.keptRatio).toBeNull();
    expect(small.style).toBeNull();

    const cons = computeGuidanceCredibility([
      makeItem({
        id: "1",
        targetFiscalYear: 2024,
        targetFiscalPeriod: "Q1",
        outcome: "beat",
        surprise: 4,
      }),
      makeItem({
        id: "2",
        targetFiscalYear: 2024,
        targetFiscalPeriod: "Q2",
        outcome: "beat",
        surprise: 3,
      }),
      makeItem({
        id: "3",
        targetFiscalYear: 2024,
        targetFiscalPeriod: "Q3",
        outcome: "beat",
        surprise: 2.5,
      }),
      makeItem({
        id: "4",
        targetFiscalYear: 2024,
        targetFiscalPeriod: "Q4",
        outcome: "beat",
        surprise: 3.5,
      }),
      makeItem({
        id: "5",
        targetFiscalYear: 2025,
        targetFiscalPeriod: "Q1",
        outcome: "in_line",
        surprise: 0.5,
      }),
      makeItem({
        id: "6",
        targetFiscalYear: 2025,
        targetFiscalPeriod: "Q2",
        outcome: "in_line",
        surprise: 0.5,
      }),
      makeItem({
        id: "7",
        targetFiscalYear: 2025,
        targetFiscalPeriod: "Q3",
        status: "draft_ai",
        outcome: "miss",
        surprise: -10,
      }),
    ]);
    expect(cons.resolved).toBe(6);
    expect(cons.keptRatio).toBe("6/6");
    expect(cons.style).toBe("conservative");
  });
});
