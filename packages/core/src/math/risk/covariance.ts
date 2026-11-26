export interface LedoitWolfResult {
  covariance: number[][];
  shrinkageIntensity: number;
}

function computeMeans(series: readonly (readonly number[])[]): number[] {
  return series.map((s) => (s.length > 0 ? s.reduce((a, b) => a + b, 0) / s.length : 0));
}

function pairCovariance(
  si: readonly number[],
  sj: readonly number[],
  mi: number,
  mj: number,
  t: number,
): number {
  let acc = 0;
  for (let k = 0; k < t; k += 1) {
    acc += ((si[k] ?? 0) - mi) * ((sj[k] ?? 0) - mj);
  }
  return acc / Math.max(1, t);
}

function pairCrossVariance(
  si: readonly number[],
  sj: readonly number[],
  mi: number,
  mj: number,
  sij: number,
  t: number,
): number {
  let sumSq = 0;
  for (let k = 0; k < t; k += 1) {
    const prod = ((si[k] ?? 0) - mi) * ((sj[k] ?? 0) - mj);
    sumSq += (prod - sij) ** 2;
  }
  return sumSq / (t * t);
}

function computeSampleCovariance(
  series: readonly (readonly number[])[],
  means: readonly number[],
  t: number,
): number[][] {
  return series.map((si, i) =>
    series.map((sj, j) => pairCovariance(si, sj, means[i] ?? 0, means[j] ?? 0, t)),
  );
}

function computeShrinkageDelta(
  series: readonly (readonly number[])[],
  means: readonly number[],
  sample: readonly (readonly number[])[],
  mu: number,
  t: number,
): number {
  const n = series.length;
  let d2 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const sij = sample[i]?.[j] ?? 0;
      d2 += (sij - (i === j ? mu : 0)) ** 2;
      b2 += pairCrossVariance(
        series[i] ?? [],
        series[j] ?? [],
        means[i] ?? 0,
        means[j] ?? 0,
        sij,
        t,
      );
    }
  }
  if (d2 <= 1e-14) return 1;
  return Math.max(0, Math.min(1, Math.min(b2, d2) / d2));
}

/**
 * Ledoit-Wolf (2004) analytical linear shrinkage covariance estimator toward the scaled identity target.
 * Guarantees positive-definite, well-conditioned covariance even when T is small relative to N.
 */
export function estimateLedoitWolfCovariance(
  assetReturnSeries: readonly (readonly number[])[],
): LedoitWolfResult {
  const n = assetReturnSeries.length;
  if (n === 0) return { covariance: [], shrinkageIntensity: 0 };
  const t = Math.min(...assetReturnSeries.map((s) => s.length));
  if (t < 2) {
    const id = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1e-4 : 0)),
    );
    return { covariance: id, shrinkageIntensity: 1 };
  }
  const means = computeMeans(assetReturnSeries);
  const sample = computeSampleCovariance(assetReturnSeries, means, t);
  let trace = 0;
  for (let i = 0; i < n; i += 1) trace += sample[i]?.[i] ?? 0;
  const mu = trace / n;
  const delta = computeShrinkageDelta(assetReturnSeries, means, sample, mu, t);

  const shrunk = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const target = i === j ? mu : 0;
      return (1 - delta) * (sample[i]?.[j] ?? 0) + delta * target;
    }),
  );
  return { covariance: shrunk, shrinkageIntensity: Math.round(delta * 1000) / 1000 };
}
