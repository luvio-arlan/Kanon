import type { RiskContributionRow } from "../../contracts/analytics";
import { roundTo } from "../valuation-scenarios";
import { jacobiSymmetricEigen } from "./jacobi-eigen";

export interface RiskDecompositionOutput {
  annualizedVolPct: number;
  diversificationRatio: number;
  effectiveNumHoldings: number;
  effectiveNumBets: number;
  portfolioBeta: number | null;
  contributions: RiskContributionRow[];
}

function dotVec(a: readonly number[], b: readonly number[]): number {
  let acc = 0;
  for (let i = 0; i < a.length; i += 1) acc += (a[i] ?? 0) * (b[i] ?? 0);
  return acc;
}

/** Computes Meucci (2009) Effective Number of Bets via PCA eigen-portfolio entropy (S2). */
export function computeMeucciEnb(
  weights: readonly number[],
  covariance: readonly (readonly number[])[],
): number {
  const n = weights.length;
  if (n <= 1) return n;
  const { eigenvalues, eigenvectors } = jacobiSymmetricEigen(covariance);
  const contribs = eigenvalues.map((lam, k) => {
    const proj = dotVec(eigenvectors[k] ?? [], weights);
    return Math.max(0, lam) * proj * proj;
  });
  const totalVar = contribs.reduce((s, c) => s + c, 0);
  if (totalVar <= 1e-14) return 1;
  let entropy = 0;
  for (const c of contribs) {
    const p = c / totalVar;
    if (p > 1e-12) entropy -= p * Math.log(p);
  }
  return roundTo(Math.max(1, Math.min(n, Math.exp(entropy))), 2);
}

function computeSeriesBeta(asset: readonly number[], bench: readonly number[]): number | null {
  const n = Math.min(asset.length, bench.length);
  if (n < 20) return null;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i += 1) {
    ma += asset[i] ?? 0;
    mb += bench[i] ?? 0;
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = (asset[i] ?? 0) - ma;
    const db = (bench[i] ?? 0) - mb;
    cov += da * db;
    varB += db * db;
  }
  return varB > 1e-12 ? roundTo(cov / varB, 2) : null;
}

function buildContribRows(params: {
  tickers: readonly string[];
  rawWeights: readonly number[];
  normW: readonly number[];
  sigmaW: readonly number[];
  covariance: readonly (readonly number[])[];
  dailyVol: number;
  portVar: number;
  assetReturns?: readonly (readonly number[])[];
  spyReturns?: readonly number[] | null;
}): RiskContributionRow[] {
  const ann = Math.sqrt(252);
  return params.tickers.map((ticker, i) => {
    const w = params.normW[i] ?? 0;
    const standalone = Math.sqrt(Math.max(0, params.covariance[i]?.[i] ?? 0)) * ann * 100;
    const mcr =
      params.dailyVol > 1e-12 ? ((params.sigmaW[i] ?? 0) / params.dailyVol) * ann * 100 : 0;
    const pcr = params.portVar > 1e-12 ? ((w * (params.sigmaW[i] ?? 0)) / params.portVar) * 100 : 0;
    const assetRet = params.assetReturns?.[i];
    const betaVsSpy =
      assetRet && params.spyReturns ? computeSeriesBeta(assetRet, params.spyReturns) : null;
    return {
      ticker,
      weightPct: roundTo((params.rawWeights[i] ?? 0) * 100, 2),
      standaloneVolPct: roundTo(standalone, 2),
      mcrPct: roundTo(mcr, 2),
      pcrPct: roundTo(pcr, 2),
      betaVsSpy,
    };
  });
}

/** Decomposes portfolio risk into annualized vol, DR, ENH, Meucci ENB, Beta, and MCR/PCR (S2). */
export function decomposePortfolioRisk(params: {
  tickers: readonly string[];
  weights: readonly number[];
  covariance: readonly (readonly number[])[];
  assetReturns?: readonly (readonly number[])[];
  spyReturns?: readonly number[] | null;
}): RiskDecompositionOutput {
  const n = params.tickers.length;
  const wSum = params.weights.reduce((s, w) => s + Math.max(0, w), 0);
  const normW = wSum > 1e-9 ? params.weights.map((w) => Math.max(0, w) / wSum) : params.weights;
  const sigmaW = Array.from({ length: n }, (_, i) => dotVec(params.covariance[i] ?? [], normW));
  const portVar = dotVec(normW, sigmaW);
  const weightedStandaloneVol = normW.reduce(
    (s, w, i) => s + w * Math.sqrt(Math.max(0, params.covariance[i]?.[i] ?? 0)),
    0,
  );
  const dailyVol = Math.sqrt(Math.max(0, portVar));
  const contributions = buildContribRows({
    tickers: params.tickers,
    rawWeights: params.weights,
    normW,
    sigmaW,
    covariance: params.covariance,
    dailyVol,
    portVar,
    assetReturns: params.assetReturns,
    spyReturns: params.spyReturns,
  });
  const sumW2 = dotVec(normW, normW);
  const portfolioBeta =
    params.spyReturns && contributions.every((c) => c.betaVsSpy !== null)
      ? roundTo(
          contributions.reduce((s, c, i) => s + (normW[i] ?? 0) * (c.betaVsSpy ?? 0), 0),
          2,
        )
      : null;
  return {
    annualizedVolPct: roundTo(dailyVol * Math.sqrt(252) * 100, 2),
    diversificationRatio:
      dailyVol > 1e-12 ? roundTo(Math.max(1, weightedStandaloneVol / dailyVol), 2) : 1,
    effectiveNumHoldings: sumW2 > 1e-9 ? roundTo(1 / sumW2, 2) : 0,
    effectiveNumBets: computeMeucciEnb(normW, params.covariance),
    portfolioBeta,
    contributions,
  };
}
