import { roundTo } from "../valuation-scenarios";

export interface ConstrainedKellyInput {
  tickers: readonly string[];
  /** Annualized expected excess returns (decimal, e.g. 0.12 = 12%). */
  expectedExcessReturns: readonly number[];
  /** Annualized covariance matrix (N x N). */
  annualCovariance: readonly (readonly number[])[];
  /** Per-name weight ceiling (decimal, default 0.20). */
  maxSingleWeight?: number;
  /** Fraction of full Kelly to apply (default 0.5 for Half-Kelly). */
  kellyFraction?: number;
}

export interface ConstrainedKellyResult {
  weights: Array<{ ticker: string; weightPct: number }>;
  totalInvestedPct: number;
  cashWeightPct: number;
  expectedExcessReturnPct: number;
  expectedVolPct: number;
}

function projectToSimplexCap(raw: readonly number[], maxWeight: number): number[] {
  const clamped = raw.map((w) => Math.max(0, Math.min(maxWeight, w)));
  const sum = clamped.reduce((a, b) => a + b, 0);
  if (sum <= 1) return clamped;
  return clamped.map((w) => w / sum);
}

function summarizeKellyPortfolio(
  tickers: readonly string[],
  w: readonly number[],
  expectedExcessReturns: readonly number[],
  annualCovariance: readonly (readonly number[])[],
): ConstrainedKellyResult {
  let expRet = 0;
  let portVar = 0;
  for (let i = 0; i < w.length; i += 1) {
    const wi = w[i] ?? 0;
    expRet += wi * (expectedExcessReturns[i] ?? 0);
    for (let j = 0; j < w.length; j += 1) {
      portVar += wi * (annualCovariance[i]?.[j] ?? 0) * (w[j] ?? 0);
    }
  }
  const totalInvested = w.reduce((a, b) => a + b, 0);
  return {
    weights: tickers.map((ticker, i) => ({
      ticker,
      weightPct: roundTo((w[i] ?? 0) * 100, 1),
    })),
    totalInvestedPct: roundTo(totalInvested * 100, 1),
    cashWeightPct: roundTo(Math.max(0, 1 - totalInvested) * 100, 1),
    expectedExcessReturnPct: roundTo(expRet * 100, 2),
    expectedVolPct: roundTo(Math.sqrt(Math.max(0, portVar)) * 100, 2),
  };
}

/**
 * Long-only, zero-leverage constrained multi-asset Kelly optimizer (W6.3).
 * Maximizes U(w) = mu^T w - (1 / (2 * f)) w^T Sigma w subject to 0 <= w_i <= maxSingleWeight, sum(w) <= 1.
 */
export function solveConstrainedMultiAssetKelly(
  input: ConstrainedKellyInput,
): ConstrainedKellyResult {
  const n = input.tickers.length;
  if (n === 0) {
    return {
      weights: [],
      totalInvestedPct: 0,
      cashWeightPct: 100,
      expectedExcessReturnPct: 0,
      expectedVolPct: 0,
    };
  }
  const maxW = Math.max(0.01, Math.min(1, input.maxSingleWeight ?? 0.2));
  const riskAversion = 1 / Math.max(0.1, Math.min(1, input.kellyFraction ?? 0.5));
  let w = Array<number>(n).fill(Math.min(maxW, 1 / n));

  for (let iter = 0; iter < 400; iter += 1) {
    const next = w.map((wi, i) => {
      let sigmaWi = 0;
      for (let j = 0; j < n; j += 1) {
        sigmaWi += (input.annualCovariance[i]?.[j] ?? 0) * (w[j] ?? 0);
      }
      return wi + 0.05 * ((input.expectedExcessReturns[i] ?? 0) - riskAversion * sigmaWi);
    });
    w = projectToSimplexCap(next, maxW);
  }
  return summarizeKellyPortfolio(
    input.tickers,
    w,
    input.expectedExcessReturns,
    input.annualCovariance,
  );
}
