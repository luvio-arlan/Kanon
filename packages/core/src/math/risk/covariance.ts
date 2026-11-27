export interface ShrunkCovarianceResult {
  covariance: number[][];
  correlation: number[][];
  volatilities: number[];
  shrinkageIntensity: number;
}

function computeMeans(series: readonly (readonly number[])[]): number[] {
  return series.map((s) => (s.length > 0 ? s.reduce((a, b) => a + b, 0) / s.length : 0));
}

function computeSampleCovariance(
  series: readonly (readonly number[])[],
  means: readonly number[],
  t: number,
): number[][] {
  const n = series.length;
  const denom = Math.max(1, t - 1);
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let acc = 0;
      const si = series[i] ?? [];
      const sj = series[j] ?? [];
      const mi = means[i] ?? 0;
      const mj = means[j] ?? 0;
      for (let k = 0; k < t; k += 1) acc += ((si[k] ?? 0) - mi) * ((sj[k] ?? 0) - mj);
      return acc / denom;
    }),
  );
}

function buildConstantCorrelationTarget(sample: readonly (readonly number[])[]): number[][] {
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
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      i === j ? (sample[i]?.[i] ?? 0) : rBar * (vols[i] ?? 0) * (vols[j] ?? 0),
    ),
  );
}

function computePairPi(
  si: readonly number[],
  sj: readonly number[],
  mi: number,
  mj: number,
  sij: number,
  t: number,
): number {
  let acc = 0;
  for (let k = 0; k < t; k += 1) {
    const prod = ((si[k] ?? 0) - mi) * ((sj[k] ?? 0) - mj);
    acc += (prod - sij) ** 2;
  }
  return acc / t;
}

function computeConstantCorrShrinkage(
  series: readonly (readonly number[])[],
  means: readonly number[],
  sample: readonly (readonly number[])[],
  target: readonly (readonly number[])[],
  t: number,
): number {
  const n = series.length;
  let piSum = 0;
  let gammaSum = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const sij = sample[i]?.[j] ?? 0;
      const fij = target[i]?.[j] ?? 0;
      gammaSum += (fij - sij) ** 2;
      piSum += computePairPi(
        series[i] ?? [],
        series[j] ?? [],
        means[i] ?? 0,
        means[j] ?? 0,
        sij,
        t,
      );
    }
  }
  if (gammaSum <= 1e-14) return 0;
  return Math.max(0, Math.min(1, piSum / (t * gammaSum)));
}

/**
 * Ledoit-Wolf (2004) analytical shrinkage covariance estimator toward the Constant-Correlation target (S2).
 * Guarantees well-conditioned PSD covariance with preserved cross-sectional correlation structure.
 */
export function estimateShrunkCovariance(
  assetReturnSeries: readonly (readonly number[])[],
): ShrunkCovarianceResult {
  const n = assetReturnSeries.length;
  if (n === 0) return { covariance: [], correlation: [], volatilities: [], shrinkageIntensity: 0 };
  const t = Math.min(...assetReturnSeries.map((s) => s.length));
  if (t < 2) {
    const id = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1e-4 : 0)),
    );
    const corr = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    );
    return {
      covariance: id,
      correlation: corr,
      volatilities: Array(n).fill(0.01),
      shrinkageIntensity: 1,
    };
  }
  const means = computeMeans(assetReturnSeries);
  const sample = computeSampleCovariance(assetReturnSeries, means, t);
  const target = buildConstantCorrelationTarget(sample);
  const delta = computeConstantCorrShrinkage(assetReturnSeries, means, sample, target, t);
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
