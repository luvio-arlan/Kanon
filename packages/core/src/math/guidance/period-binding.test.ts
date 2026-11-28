import { describe, expect, it } from "vitest";
import {
  bindPeriodFact,
  bindQ4DerivedFact,
  computeGuidanceEpsSplitFactor,
  type PitFactCandidate,
  scoreGuidanceOutcome,
} from "./index";

describe("U0-6 Guidance Period Binding & Split Normalization (P0-4)", () => {
  it("deterministically binds FY2025 to max(periodEnd) across 100 random comparative row orders", () => {
    const comparativeRows: PitFactCandidate[] = [
      {
        accession: "0001045810-25-000023",
        concept: "revenue",
        duration: "annual",
        fiscalYear: 2025,
        fiscalPeriod: "FY",
        periodStart: "2024-01-29",
        periodEnd: "2025-01-26",
        filedAt: "2025-02-26",
        value: 130.5e9,
      },
      {
        accession: "0001045810-25-000023",
        concept: "revenue",
        duration: "annual",
        fiscalYear: 2025,
        fiscalPeriod: "FY",
        periodStart: "2023-01-30",
        periodEnd: "2024-01-28",
        filedAt: "2025-02-26",
        value: 60.9e9,
      },
      {
        accession: "0001045810-25-000023",
        concept: "revenue",
        duration: "annual",
        fiscalYear: 2025,
        fiscalPeriod: "FY",
        periodStart: "2022-01-31",
        periodEnd: "2023-01-29",
        filedAt: "2025-02-26",
        value: 26.97e9,
      },
    ];
    for (let trial = 0; trial < 100; trial += 1) {
      const shuffled = [...comparativeRows].sort(
        (a, b) =>
          ((a.periodEnd.charCodeAt(3) + trial) % 3) - ((b.periodEnd.charCodeAt(3) + trial) % 3),
      );
      const bound = bindPeriodFact({
        facts: shuffled,
        concept: "revenue",
        targetFiscalYear: 2025,
        targetFiscalPeriod: "FY",
      });
      expect(bound?.periodEnd).toBe("2025-01-26");
      expect(bound?.value).toBe(130.5e9);
    }
  });

  it("binds 10-Q current quarter rather than prior-year comparative quarter", () => {
    const q3Facts: PitFactCandidate[] = [
      {
        accession: "0001045810-24-000300",
        concept: "revenue",
        duration: "quarter",
        fiscalYear: 2025,
        fiscalPeriod: "Q3",
        periodStart: "2023-07-31",
        periodEnd: "2023-10-29",
        filedAt: "2024-11-20",
        value: 18.12e9,
      },
      {
        accession: "0001045810-24-000300",
        concept: "revenue",
        duration: "quarter",
        fiscalYear: 2025,
        fiscalPeriod: "Q3",
        periodStart: "2024-07-29",
        periodEnd: "2024-10-27",
        filedAt: "2024-11-20",
        value: 35.08e9,
      },
    ];
    const bound = bindPeriodFact({
      facts: q3Facts,
      concept: "revenue",
      targetFiscalYear: 2025,
      targetFiscalPeriod: "Q3",
    });
    expect(bound?.periodEnd).toBe("2024-10-27");
    expect(bound?.value).toBe(35.08e9);
  });

  it("derives Q4 = FY - YTD9M when start dates match and normalizes pre-split EPS guidance", () => {
    const q4 = bindQ4DerivedFact({
      concept: "revenue",
      targetFiscalYear: 2025,
      facts: [
        {
          accession: "acc-fy",
          concept: "revenue",
          duration: "annual",
          fiscalYear: 2025,
          fiscalPeriod: "FY",
          periodStart: "2024-01-29",
          periodEnd: "2025-01-26",
          filedAt: "2025-02-26",
          value: 130e9,
        },
        {
          accession: "acc-q3",
          concept: "revenue",
          duration: "ytd",
          fiscalYear: 2025,
          fiscalPeriod: "Q3",
          periodStart: "2024-01-29",
          periodEnd: "2024-10-27",
          filedAt: "2024-11-20",
          value: 91e9,
        },
      ],
    });
    expect(q4?.value).toBe(39e9);
    expect(q4?.derived).toBe("fy_minus_9m");

    // Pre-split EPS guidance $10-$11 (issued 2024-02-21) -> 10:1 split 2024-06-10 -> post-split actual $2.94 -> beat!
    const factor = computeGuidanceEpsSplitFactor("2024-02-21", "2025-02-26", [
      { exDate: "2024-06-10", ratio: 10 },
    ]);
    expect(factor).toBe(10);
    const scored = scoreGuidanceOutcome({
      metric: "diluted_eps",
      unit: "usd_per_share",
      low: 10 / factor,
      high: 11 / factor,
      actual: 2.94,
    });
    expect(scored.outcome).toBe("beat");
  });
});
