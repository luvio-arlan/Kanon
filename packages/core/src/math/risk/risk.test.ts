import { describe, expect, it } from "vitest";
import {
  calculatePortfolioRiskMetrics,
  estimateLedoitWolfCovariance,
  solveConstrainedMultiAssetKelly,
} from "./index";

describe("Institutional Portfolio Risk & Constrained Kelly Engine (W6.2-W6.3)", () => {
  it("estimates Ledoit-Wolf shrinkage covariance and computes MCTR/PCR, VaR/CVaR & drawdown", () => {
    const rA = [0.01, -0.02, 0.015, -0.01, 0.02, -0.015, 0.005, 0.012, -0.008, 0.018, -0.025, 0.01];
    const rB = [
      0.005, -0.01, 0.008, -0.005, 0.01, -0.007, 0.002, 0.006, -0.004, 0.009, -0.012, 0.005,
    ];
    const lw = estimateLedoitWolfCovariance([rA, rB]);
    expect(lw.shrinkageIntensity).toBeGreaterThanOrEqual(0);
    expect(lw.shrinkageIntensity).toBeLessThanOrEqual(1);
    expect(lw.covariance[0]?.[0]).toBeGreaterThan(0);

    const portRet = rA.map((a, i) => 0.6 * a + 0.4 * (rB[i] ?? 0));
    const report = calculatePortfolioRiskMetrics({
      tickers: ["NVDA", "MSFT"],
      weights: [0.6, 0.4],
      dailyCovariance: lw.covariance,
      dailyPortfolioReturns: portRet,
      dailyBenchmarkReturns: rB,
    });
    const pcrSum = report.contributions.reduce((s, c) => s + c.pcrPct, 0);
    expect(pcrSum).toBeCloseTo(100, 0);
    expect(report.maxDrawdownPct).toBeGreaterThan(0);
    expect(report.historicalCvar95Pct).toBeGreaterThanOrEqual(report.historicalVar95Pct);
    expect(report.betaVsBenchmark).toBeGreaterThan(1);
  });

  it("enforces long-only, zero-leverage (sum <= 100%) and per-name cap in multi-asset Kelly", () => {
    const kelly = solveConstrainedMultiAssetKelly({
      tickers: ["NVDA", "MSFT", "MU"],
      expectedExcessReturns: [0.18, 0.12, -0.05],
      annualCovariance: [
        [0.16, 0.04, 0.06],
        [0.04, 0.06, 0.02],
        [0.06, 0.02, 0.2],
      ],
      maxSingleWeight: 0.25,
      kellyFraction: 0.5,
    });
    expect(kelly.totalInvestedPct).toBeLessThanOrEqual(100);
    for (const row of kelly.weights) {
      expect(row.weightPct).toBeGreaterThanOrEqual(0);
      expect(row.weightPct).toBeLessThanOrEqual(25);
    }
    const muRow = kelly.weights.find((w) => w.ticker === "MU");
    expect(muRow?.weightPct).toBe(0);
  });
});
