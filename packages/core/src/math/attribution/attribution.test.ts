import { describe, expect, it } from "vitest";
import { buildDecisionEpisodes, classifyDecisionMatrix, computePitBeta } from "./index";

function makeLinearBars(startDay: number, count: number, stepFn: (i: number) => number) {
  const base = Date.parse("2024-01-01T00:00:00Z");
  return Array.from({ length: count }, (_, i) => ({
    barDate: new Date(base + (startDay + i) * 86_400_000).toISOString().slice(0, 10),
    close: stepFn(i),
  }));
}

describe("S3 Decision x Outcome 2x2 Attribution & PIT Beta", () => {
  it("computes PIT Beta strictly using bars < openDate (zero look-ahead bias)", () => {
    let s = 100;
    let a = 100;
    const spyBars = makeLinearBars(0, 120, (i) => {
      const r = i % 2 === 0 ? 0.01 : -0.006;
      s *= 1 + r;
      return s;
    });
    const assetBars = makeLinearBars(0, 120, (i) => {
      const r = i % 2 === 0 ? 0.015 : -0.009;
      a *= 1 + r;
      return a;
    });
    const openDate = spyBars[90]?.barDate ?? "2024-04-01";
    const betaBefore = computePitBeta({
      assetBars,
      assetDividends: [],
      spyBars,
      spyDividends: [],
      openDate,
    });
    expect(betaBefore).toBeCloseTo(1.5, 1);

    // Mutate bars ON and AFTER openDate wildly — PIT Beta MUST stay bit-identical
    const mutatedAsset = assetBars.map((b) =>
      b.barDate >= openDate ? { ...b, close: b.close * (b.barDate.endsWith("1") ? 2.5 : 0.4) } : b,
    );
    const betaAfterMutation = computePitBeta({
      assetBars: mutatedAsset,
      assetDividends: [],
      spyBars,
      spyDividends: [],
      openDate,
    });
    expect(betaAfterMutation).toBe(betaBefore);
  });

  it("classifies all 4 quadrants + pending and respects PIT hypothesis cutoff at episode closeDate", () => {
    const episodes = buildDecisionEpisodes({
      transactions: [
        {
          id: "b1",
          thesisId: "th-skill",
          ticker: "AAA",
          action: "buy",
          quantity: 10,
          price: 100,
          fees: 0,
          tradeDate: "2025-01-02",
          createdAtMs: 1,
        },
        {
          id: "s1",
          thesisId: "th-skill",
          ticker: "AAA",
          action: "sell",
          quantity: 10,
          price: 140,
          fees: 0,
          tradeDate: "2025-02-01",
          createdAtMs: 2,
        },
        {
          id: "b2",
          thesisId: "th-badluck",
          ticker: "BBB",
          action: "buy",
          quantity: 10,
          price: 100,
          fees: 0,
          tradeDate: "2025-01-02",
          createdAtMs: 3,
        },
        {
          id: "s2",
          thesisId: "th-badluck",
          ticker: "BBB",
          action: "sell",
          quantity: 10,
          price: 80,
          fees: 0,
          tradeDate: "2025-02-01",
          createdAtMs: 4,
        },
        {
          id: "b3",
          thesisId: "th-lucky",
          ticker: "CCC",
          action: "buy",
          quantity: 10,
          price: 100,
          fees: 0,
          tradeDate: "2025-01-02",
          createdAtMs: 5,
        },
        {
          id: "s3",
          thesisId: "th-lucky",
          ticker: "CCC",
          action: "sell",
          quantity: 10,
          price: 130,
          fees: 0,
          tradeDate: "2025-02-01",
          createdAtMs: 6,
        },
        {
          id: "b4",
          thesisId: "th-mistake",
          ticker: "DDD",
          action: "buy",
          quantity: 10,
          price: 100,
          fees: 0,
          tradeDate: "2025-01-02",
          createdAtMs: 7,
        },
        {
          id: "s4",
          thesisId: "th-mistake",
          ticker: "DDD",
          action: "sell",
          quantity: 10,
          price: 70,
          fees: 0,
          tradeDate: "2025-02-01",
          createdAtMs: 8,
        },
        {
          id: "b5",
          thesisId: "th-pending",
          ticker: "EEE",
          action: "buy",
          quantity: 10,
          price: 100,
          fees: 0,
          tradeDate: "2025-01-02",
          createdAtMs: 9,
        },
      ],
      snapshotsByTxId: new Map([
        [
          "b1",
          {
            transactionId: "b1",
            thesisId: "th-skill",
            snapshotHash: "h1",
            hypothesisIds: ["hyp-1"],
          },
        ],
        [
          "b2",
          {
            transactionId: "b2",
            thesisId: "th-badluck",
            snapshotHash: "h2",
            hypothesisIds: ["hyp-2"],
          },
        ],
        [
          "b3",
          {
            transactionId: "b3",
            thesisId: "th-lucky",
            snapshotHash: "h3",
            hypothesisIds: ["hyp-3"],
          },
        ],
        [
          "b4",
          {
            transactionId: "b4",
            thesisId: "th-mistake",
            snapshotHash: "h4",
            hypothesisIds: ["hyp-4"],
          },
        ],
        [
          "b5",
          {
            transactionId: "b5",
            thesisId: "th-pending",
            snapshotHash: "h5",
            hypothesisIds: ["hyp-5"],
          },
        ],
      ]),
      splitsByTicker: new Map(),
      latestCloseByTicker: new Map([["EEE", 105]]),
      asOfDate: "2025-03-01",
    });

    const spyBars = [
      { barDate: "2025-01-02", close: 500 },
      { barDate: "2025-02-01", close: 505 },
      { barDate: "2025-03-01", close: 510 },
    ];
    const report = classifyDecisionMatrix({
      episodes,
      hypothesisEvents: [
        {
          thesisId: "th-skill",
          hypothesisId: "hyp-1",
          toStatus: "validated",
          recordedAt: "2025-01-20T00:00:00Z",
        },
        // Post-close invalidation MUST NOT retroactively change closed th-skill episode!
        {
          thesisId: "th-skill",
          hypothesisId: "hyp-1",
          toStatus: "invalidated",
          recordedAt: "2025-02-15T00:00:00Z",
        },
        {
          thesisId: "th-badluck",
          hypothesisId: "hyp-2",
          toStatus: "validated",
          recordedAt: "2025-01-20T00:00:00Z",
        },
        {
          thesisId: "th-lucky",
          hypothesisId: "hyp-3",
          toStatus: "invalidated",
          recordedAt: "2025-01-20T00:00:00Z",
        },
        {
          thesisId: "th-mistake",
          hypothesisId: "hyp-4",
          toStatus: "invalidated",
          recordedAt: "2025-01-20T00:00:00Z",
        },
        {
          thesisId: "th-pending",
          hypothesisId: "hyp-5",
          toStatus: "watching",
          recordedAt: "2025-01-20T00:00:00Z",
        },
      ],
      barsByTicker: new Map(),
      dividendsByTicker: new Map(),
      spyBars,
      spyDividends: [],
      asOfDate: "2025-03-01",
    });
    expect(report.counts).toEqual({
      skill: 1,
      good_process_bad_luck: 1,
      lucky: 1,
      mistake: 1,
      pending: 1,
    });
    expect(report.skillRatePct).toBe(25);
  });

  it("U0-8: falls back to excess_vs_spy when pitBeta is null, marks no-snapshot episodes pending, and clamps 0033 backfill look-ahead", () => {
    const episodes = buildDecisionEpisodes({
      transactions: [
        {
          id: "b-nosnap",
          thesisId: "th-1",
          ticker: "AAA",
          action: "buy",
          quantity: 10,
          price: 100,
          fees: 0,
          tradeDate: "2025-01-02",
          createdAtMs: 1,
        },
        {
          id: "s-nosnap",
          thesisId: "th-1",
          ticker: "AAA",
          action: "sell",
          quantity: 10,
          price: 130,
          fees: 0,
          tradeDate: "2025-02-01",
          createdAtMs: 2,
        },
        {
          id: "b-prehist",
          thesisId: "th-2",
          ticker: "BBB",
          action: "buy",
          quantity: 10,
          price: 100,
          fees: 0,
          tradeDate: "2025-01-02",
          createdAtMs: 3,
        },
        {
          id: "s-prehist",
          thesisId: "th-2",
          ticker: "BBB",
          action: "sell",
          quantity: 10,
          price: 130,
          fees: 0,
          tradeDate: "2025-02-01",
          createdAtMs: 4,
        },
      ],
      snapshotsByTxId: new Map([
        [
          "b-prehist",
          {
            transactionId: "b-prehist",
            thesisId: "th-2",
            snapshotHash: "h-pre",
            hypothesisIds: ["hyp-pre"],
          },
        ],
      ]),
      splitsByTicker: new Map(),
      latestCloseByTicker: new Map(),
      asOfDate: "2025-03-01",
    });
    const report = classifyDecisionMatrix({
      episodes,
      hypothesisEvents: [
        {
          thesisId: "th-1",
          hypothesisId: "hyp-post",
          toStatus: "validated",
          recordedAt: "2025-01-10T00:00:00Z",
        },
        {
          thesisId: "th-2",
          hypothesisId: "hyp-pre",
          toStatus: "validated",
          source: "import",
          recordedAt: "2025-01-01T00:00:00Z",
        },
      ],
      barsByTicker: new Map(),
      dividendsByTicker: new Map(),
      spyBars: [
        { barDate: "2025-01-02", close: 500 },
        { barDate: "2025-02-01", close: 505 },
      ],
      spyDividends: [],
      asOfDate: "2025-03-01",
      migration0033AppliedAt: "2025-06-01T00:00:00Z",
    });
    const noSnap = report.episodes.find((e) => e.ticker === "AAA");
    const preHist = report.episodes.find((e) => e.ticker === "BBB");
    expect(noSnap?.quadrant).toBe("pending");
    expect(noSnap?.pendingReason).toBe("no_snapshot");
    expect(noSnap?.outcomeBasis).toBe("excess_vs_spy");
    expect(noSnap?.pitBeta).toBeNull();
    expect(preHist?.quadrant).toBe("pending");
    expect(preHist?.pendingReason).toBe("pre_history");
  });
});
