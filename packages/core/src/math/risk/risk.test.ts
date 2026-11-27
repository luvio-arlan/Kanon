import { describe, expect, it } from "vitest";
import {
  buildAlignedDailyReturns,
  CORRELATED_CLUSTER_CAP_PCT,
  calculatePortfolioRiskMetrics,
  clusterCorrelations,
  computeMeucciEnb,
  decomposePortfolioRisk,
  estimateShrunkCovariance,
  jacobiSymmetricEigen,
  solveConstrainedMultiAssetKelly,
} from "./index";

describe("Institutional Portfolio Risk & S2 Daily Covariance Engine", () => {
  it("estimates Constant-Correlation Ledoit-Wolf shrinkage covariance and computes MCTR/PCR & VaR/CVaR", () => {
    const rA = [0.01, -0.02, 0.015, -0.01, 0.02, -0.015, 0.005, 0.012, -0.008, 0.018, -0.025, 0.01];
    const rB = [
      0.005, -0.01, 0.008, -0.005, 0.01, -0.007, 0.002, 0.006, -0.004, 0.009, -0.012, 0.005,
    ];
    const lw = estimateShrunkCovariance([rA, rB]);
    expect(lw.shrinkageIntensity).toBeGreaterThanOrEqual(0);
    expect(lw.shrinkageIntensity).toBeLessThanOrEqual(1);
    expect(lw.covariance[0]?.[0]).toBeGreaterThan(0);
    expect(lw.correlation[0]?.[1]).toBeGreaterThan(0.9);

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
    expect(report.effectiveNumHoldings).toBeCloseTo(1 / (0.36 + 0.16), 2);
  });

  it("distinguishes Meucci ENB from ENH: 2 perfectly correlated 50/50 assets yield ENH=2.0 and ENB=1.0", () => {
    const covPerfect = [
      [0.04, 0.04],
      [0.04, 0.04],
    ];
    const enbPerfect = computeMeucciEnb([0.5, 0.5], covPerfect);
    expect(enbPerfect).toBeCloseTo(1.0, 2);

    const covOrthog = [
      [0.04, 0],
      [0, 0.04],
    ];
    const decomp = decomposePortfolioRisk({
      tickers: ["A", "B"],
      weights: [0.5, 0.5],
      covariance: covOrthog,
    });
    expect(decomp.effectiveNumHoldings).toBeCloseTo(2.0, 2);
    expect(decomp.effectiveNumBets).toBeCloseTo(2.0, 2);
    expect(decomp.diversificationRatio).toBeCloseTo(Math.SQRT2, 2);
    const pcrSum = decomp.contributions.reduce((s, c) => s + (c.pcrPct ?? 0), 0);
    expect(pcrSum).toBeCloseTo(100, 1);
  });

  it("computes accurate Jacobi eigenvalues/eigenvectors on symmetric PSD matrices", () => {
    const m = [
      [3, 1],
      [1, 3],
    ];
    const { eigenvalues } = jacobiSymmetricEigen(m);
    expect(eigenvalues[0]).toBeCloseTo(4, 6);
    expect(eigenvalues[1]).toBeCloseTo(2, 6);
  });

  it("clusters highly correlated tickers via Mantegna distance and flags cap breaches (>35%)", () => {
    const clusters = clusterCorrelations({
      tickers: ["NVDA", "AVGO", "COST"],
      weightsPct: [22, 18, 25],
      correlation: [
        [1, 0.88, 0.15],
        [0.88, 1, 0.12],
        [0.15, 0.12, 1],
      ],
    });
    expect(CORRELATED_CLUSTER_CAP_PCT).toBe(35);
    const semiCluster = clusters.find(
      (c) => c.tickers.includes("NVDA") && c.tickers.includes("AVGO"),
    );
    expect(semiCluster).toBeDefined();
    expect(semiCluster?.combinedWeightPct).toBe(40);
    expect(semiCluster?.exceedsCap).toBe(true);
    const costCluster = clusters.find((c) => c.tickers.includes("COST"));
    expect(costCluster?.exceedsCap).toBe(false);
  });

  it("aligns daily returns from unadjusted close + dividends and flags missing tickers (<60d)", () => {
    const makeBars = (n: number, startClose: number) =>
      Array.from({ length: n }, (_, i) => ({
        barDate: `2025-01-${String((i % 28) + 1).padStart(2, "0")}-${String(Math.floor(i / 28))}`,
        close: startClose * (1 + 0.002 * i),
      }));
    const aligned = buildAlignedDailyReturns({
      tickers: ["NVDA", "NEWCO"],
      barsByTicker: new Map([
        ["NVDA", makeBars(70, 100)],
        ["NEWCO", makeBars(15, 50)],
      ]),
      dividendsByTicker: new Map(),
      minDays: 60,
    });
    expect(aligned.includedTickers).toEqual(["NVDA"]);
    expect(aligned.missingTickers).toEqual(["NEWCO"]);
    expect(aligned.dates.length).toBe(69);
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
