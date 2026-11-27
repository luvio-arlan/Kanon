import { roundTo } from "../valuation-scenarios";

export interface PortfolioRiskInput {
  tickers: readonly string[];
  /** Portfolio decimal weights (e.g. 0.15 = 15%). */
  weights: readonly number[];
  /** Daily return covariance matrix (N x N). */
  dailyCovariance: readonly (readonly number[])[];
  /** Historical daily portfolio returns (decimal). */
  dailyPortfolioReturns: readonly number[];
  /** Optional daily benchmark returns (decimal) for beta & tracking error. */
  dailyBenchmarkReturns?: readonly number[];
}

export interface AssetRiskContribution {
  ticker: string;
  weightPct: number;
  mctrPct: number;
  pcrPct: number;
}

export interface PortfolioRiskReport {
  annualizedVolPct: number;
  effectiveNumHoldings: number;
  maxDrawdownPct: number;
  historicalVar95Pct: number;
  historicalCvar95Pct: number;
  betaVsBenchmark: number | null;
  contributions: AssetRiskContribution[];
}

function computeMaxDrawdownPct(returns: readonly number[]): number {
  let nav = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of returns) {
    nav *= 1 + r;
    if (nav > peak) peak = nav;
    const dd = (peak - nav) / peak;
    if (dd > maxDd) maxDd = dd;
  }
  return roundTo(maxDd * 100, 2);
}

function computeVarAndCvar95(returns: readonly number[]): { var95: number; cvar95: number } {
  if (returns.length === 0) return { var95: 0, cvar95: 0 };
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoffIdx = Math.max(0, Math.floor(sorted.length * 0.05));
  const tail = sorted.slice(0, Math.max(1, cutoffIdx + 1));
  const var95 = Math.max(0, -(sorted[cutoffIdx] ?? 0) * 100);
  const cvar95 = Math.max(0, -(tail.reduce((a, b) => a + b, 0) / tail.length) * 100);
  return { var95: roundTo(var95, 2), cvar95: roundTo(cvar95, 2) };
}

function computeBeta(port: readonly number[], bench?: readonly number[]): number | null {
  if (!bench || bench.length < 10 || port.length < 10) return null;
  const n = Math.min(port.length, bench.length);
  let mp = 0;
  let mb = 0;
  for (let i = 0; i < n; i += 1) {
    mp += port[i] ?? 0;
    mb += bench[i] ?? 0;
  }
  mp /= n;
  mb /= n;
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    const dp = (port[i] ?? 0) - mp;
    const db = (bench[i] ?? 0) - mb;
    cov += dp * db;
    varB += db * db;
  }
  return varB > 1e-12 ? roundTo(cov / varB, 2) : null;
}

/**
 * Computes institutional portfolio risk analytics: annualized vol, MCTR/PCR risk attribution,
 * Effective Number of Bets, Max Drawdown, 95% VaR/CVaR, and benchmark Beta.
 */
export function calculatePortfolioRiskMetrics(input: PortfolioRiskInput): PortfolioRiskReport {
  const n = input.weights.length;
  const sigmaW = Array.from({ length: n }, (_, i) => {
    let acc = 0;
    for (let j = 0; j < n; j += 1) {
      acc += (input.dailyCovariance[i]?.[j] ?? 0) * (input.weights[j] ?? 0);
    }
    return acc;
  });
  let portVar = 0;
  for (let i = 0; i < n; i += 1) portVar += (input.weights[i] ?? 0) * (sigmaW[i] ?? 0);
  const dailyVol = Math.sqrt(Math.max(0, portVar));
  const annFactor = Math.sqrt(252);
  const annualizedVolPct = roundTo(dailyVol * annFactor * 100, 2);

  const contributions: AssetRiskContribution[] = input.tickers.map((ticker, i) => {
    const w = input.weights[i] ?? 0;
    const mctr = dailyVol > 1e-12 ? ((sigmaW[i] ?? 0) / dailyVol) * annFactor : 0;
    const pcr = portVar > 1e-12 ? (w * (sigmaW[i] ?? 0)) / portVar : 0;
    return {
      ticker,
      weightPct: roundTo(w * 100, 2),
      mctrPct: roundTo(mctr * 100, 2),
      pcrPct: roundTo(pcr * 100, 2),
    };
  });

  const sumW2 = input.weights.reduce((s, w) => s + w * w, 0);
  const effectiveNumHoldings = sumW2 > 1e-9 ? roundTo(1 / sumW2, 2) : 0;
  const { var95, cvar95 } = computeVarAndCvar95(input.dailyPortfolioReturns);

  return {
    annualizedVolPct,
    effectiveNumHoldings,
    maxDrawdownPct: computeMaxDrawdownPct(input.dailyPortfolioReturns),
    historicalVar95Pct: var95,
    historicalCvar95Pct: cvar95,
    betaVsBenchmark: computeBeta(input.dailyPortfolioReturns, input.dailyBenchmarkReturns),
    contributions,
  };
}
