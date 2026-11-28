export interface ShrunkCovarianceResult {
  covariance: number[][];
  correlation: number[][];
  volatilities: number[];
  shrinkageIntensity: number;
}

function computeMeans(series: readonly (readonly number[])[], t: number): number[] {
  return series.map((s) => {
    let acc = 0;
    for (let k = 0; k < t; k += 1) acc += s[k] ?? 0;
    return acc / t;
  });
}

function computeSampleCovariance(
  series: readonly (readonly number[])[],
  means: readonly number[],
  t: number,
): number[][] {
  const n = series.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let acc = 0;
      const si = series[i] ?? [];
      const sj = series[j] ?? [];
      const mi = means[i] ?? 0;
      const mj = means[j] ?? 0;
      for (let k = 0; k < t; k += 1) acc += ((si[k] ?? 0) - mi) * ((sj[k] ?? 0) - mj);
      return acc / t;
    }),
  );
}

function buildConstantCorrelationTarget(sample: readonly (readonly number[])[]): {
  target: number[][];
  rBar: number;
} {
  const n = sample.length;
  const vols = sample.map((row, i) => Math.sqrt(Math.max(1e-12, row[i] ?? 0)));
  let sumCorr = 0;
  let pairs = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      sumCorr += (sample[i]?.[j] ?? 0) / ((vols[i] ?? 1) * (vols[j] ?? 1));
      pairs += 1;
    }
  }
  const rBar = pairs > 0 ? Math.max(-0.99, Math.min(0.99, sumCorr / pairs)) : 0;
  const target = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      i === j ? (sample[i]?.[i] ?? 0) : rBar * (vols[i] ?? 0) * (vols[j] ?? 0),
    ),
  );
  return { target, rBar };
}

function computePairStats(
  si: readonly number[],
  sj: readonly number[],
  mi: number,
  mj: number,
  sii: number,
  sjj: number,
  sij: number,
  t: number,
): { pi: number; thetaII: number; thetaJJ: number } {
  let piAcc = 0;
  let thII = 0;
  let thJJ = 0;
  for (let k = 0; k < t; k += 1) {
    const di = (si[k] ?? 0) - mi;
    const dj = (sj[k] ?? 0) - mj;
    const dProd = di * dj - sij;
    piAcc += dProd * dProd;
    thII += (di * di - sii) * dProd;
    thJJ += (dj * dj - sjj) * dProd;
  }
  return { pi: piAcc / t, thetaII: thII / t, thetaJJ: thJJ / t };
}

function computePairRhoContribution(
  i: number,
  j: number,
  sii: number,
  sjj: number,
  rBar: number,
  stats: { pi: number; thetaII: number; thetaJJ: number },
): number {
  if (i === j) return stats.pi;
  if (sii <= 1e-14 || sjj <= 1e-14) return 0;
  return (rBar / 2) * (Math.sqrt(sjj / sii) * stats.thetaII + Math.sqrt(sii / sjj) * stats.thetaJJ);
}

function computeLedoitWolfDelta(
  series: readonly (readonly number[])[],
  means: readonly number[],
  sample: readonly (readonly number[])[],
  target: readonly (readonly number[])[],
  rBar: number,
  t: number,
): number {
  const n = series.length;
  let piSum = 0;
  let rhoSum = 0;
  let gammaSum = 0;
  for (let i = 0; i < n; i += 1) {
    const sii = sample[i]?.[i] ?? 0;
    for (let j = 0; j < n; j += 1) {
      const sjj = sample[j]?.[j] ?? 0;
      const sij = sample[i]?.[j] ?? 0;
      gammaSum += ((target[i]?.[j] ?? 0) - sij) ** 2;
      const stats = computePairStats(
        series[i] ?? [],
        series[j] ?? [],
        means[i] ?? 0,
        means[j] ?? 0,
        sii,
        sjj,
        sij,
        t,
      );
      piSum += stats.pi;
      rhoSum += computePairRhoContribution(i, j, sii, sjj, rBar, stats);
    }
  }
  if (gammaSum <= 1e-14) return 0;
  return Math.max(0, Math.min(1, (piSum - rhoSum) / (gammaSum * t)));
}

/**
 * Ledoit-Wolf (2004) analytical shrinkage covariance estimator toward the Constant-Correlation target
 * including the exact `ρ` term (`κ = (π − ρ) / γ`, matching `covCor.m`). Returns `null` when `n = 0` or `t < 2` (P2-4 / G21).
 */
export function estimateShrunkCovariance(
  assetReturnSeries: readonly (readonly number[])[],
): ShrunkCovarianceResult | null {
  const n = assetReturnSeries.length;
  if (n === 0) return null;
  const t = Math.min(...assetReturnSeries.map((s) => s.length));
  if (t < 2) return null;
  const means = computeMeans(assetReturnSeries, t);
  const sample = computeSampleCovariance(assetReturnSeries, means, t);
  const { target, rBar } = buildConstantCorrelationTarget(sample);
  const delta = computeLedoitWolfDelta(assetReturnSeries, means, sample, target, rBar, t);
  const covariance = Array.from({ length: n }, (_, i) =>
    Array.from(
      { length: n },
      (_, j) => (1 - delta) * (sample[i]?.[j] ?? 0) + delta * (target[i]?.[j] ?? 0),
    ),
  );
  const volatilities = covariance.map((row, i) => Math.sqrt(Math.max(1e-12, row[i] ?? 0)));
  const correlation = covariance.map((row, i) =>
    row.map((val, j) =>
      i === j
        ? 1
        : Math.max(-1, Math.min(1, val / ((volatilities[i] ?? 1) * (volatilities[j] ?? 1)))),
    ),
  );
  return {
    covariance,
    correlation,
    volatilities,
    shrinkageIntensity: Math.round(delta * 1000) / 1000,
  };
}
