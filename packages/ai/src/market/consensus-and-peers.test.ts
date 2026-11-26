import type { SecSnapshot } from "@kanon/core";
import { describe, expect, it } from "vitest";
import { buildMarketBenchmarks } from "./consensus-and-peers";

const offlineFetch: typeof fetch = async () => new Response("offline", { status: 503 });

describe("W0.1 Honest Market Benchmarks (No Fabricated Consensus / Bands / Default Peers)", () => {
  it("returns unavailable consensus, null valuationBand, and empty peers for unmapped ticker", async () => {
    const res = await buildMarketBenchmarks({
      ticker: "ZZZZ",
      currentPrice: 80,
      secSnapshot: null,
      fetchImpl: offlineFetch,
    });

    expect(res.consensus.source).toBe("unavailable");
    expect(res.consensus.fy1RevenueB).toBeNull();
    expect(res.consensus.fy2RevenueB).toBeNull();
    expect(res.consensus.fy1Eps).toBeNull();
    expect(res.consensus.fy2Eps).toBeNull();
    expect(res.consensus.impliedForwardPe).toBeNull();
    expect(res.consensus.revisionTrend).toBe("unknown");
    expect(res.valuationBand).toBeNull();
    expect(res.peerMultipleRange).toBeNull();
    expect(res.historicalExtrapolation).toBeNull();
    expect(res.peers).toEqual([]);
    expect(res.sectorLabel).toBe("未映射行业");
  });

  it("keeps consensus unavailable and valuationBand null even for mapped tickers with SEC data, while exposing honest extrapolation and peer range", async () => {
    const secSnapshot: SecSnapshot = {
      ticker: "NVDA",
      cik: "0001045810",
      entityName: "NVIDIA Corp",
      source: "cached-seed",
      fetchedAt: "2026-01-01T00:00:00Z",
      filings: [],
      facts: [],
      annuals: [
        {
          fiscalYear: "FY2023",
          revenue: 60e9,
          grossProfit: 44e9,
          grossMarginPct: 73.3,
          netIncome: 30e9,
          operatingCashFlow: 32e9,
          capex: 2e9,
          freeCashFlow: 30e9,
          dilutedEps: 1.2,
        },
        {
          fiscalYear: "FY2025",
          revenue: 130e9,
          grossProfit: 97e9,
          grossMarginPct: 74.6,
          netIncome: 72e9,
          operatingCashFlow: 76e9,
          capex: 4e9,
          freeCashFlow: 72e9,
          dilutedEps: 3.0,
        },
      ],
      quarterlies: [],
    };

    const res = await buildMarketBenchmarks({
      ticker: "NVDA",
      currentPrice: 135,
      secSnapshot,
      fetchImpl: offlineFetch,
    });

    expect(res.consensus.source).toBe("unavailable");
    expect(res.consensus.fy1Eps).toBeNull();
    expect(res.valuationBand).toBeNull();
    expect(res.peers.map((p) => p.ticker)).toEqual(["AVGO", "AMD", "TSM", "ASML"]);
    expect(res.peerMultipleRange).not.toBeNull();
    expect(res.peerMultipleRange?.sampleSize).toBe(4);
    expect(res.peerMultipleRange?.min).toBe(21);
    expect(res.peerMultipleRange?.max).toBe(30);
    expect(res.peerMultipleRange?.current).toBe(45);
    expect(res.historicalExtrapolation).not.toBeNull();
    expect(res.historicalExtrapolation?.trailingEps).toBe(3);
  });
});
