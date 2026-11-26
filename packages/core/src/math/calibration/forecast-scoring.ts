import { roundTo } from "../valuation-scenarios";

export interface ResolvedMultiClassForecast {
  /** Probability distribution across K mutually exclusive outcomes (must sum ~1). */
  probabilities: readonly number[];
  /** Zero-based index of the outcome that actually materialized. */
  outcomeIndex: number;
}

export interface ResolvedBinaryForecast {
  probability: number;
  occurred: boolean;
}

export interface CalibrationBucket {
  bucketLabel: string;
  midpointPct: number;
  count: number;
  avgForecastPct: number;
  observedRatePct: number;
}

export interface MurphyDecomposition {
  brierScore: number;
  reliability: number;
  resolution: number;
  uncertainty: number;
  buckets: CalibrationBucket[];
}

export interface ProcessOutcomeItem {
  goodProcess: boolean;
  goodOutcome: boolean;
}

export interface ProcessOutcomeMatrix {
  deservedWin: number;
  dumbLuck: number;
  badBreak: number;
  expectedLoss: number;
  total: number;
}

/**
 * Multi-class proper Brier score: (1/N) * sum_t sum_k (p_{t,k} - o_{t,k})^2.
 * Returns null if zero resolved forecasts exist (never fabricated).
 */
export function calculateMultiClassBrierScore(
  forecasts: readonly ResolvedMultiClassForecast[],
): number | null {
  if (forecasts.length === 0) return null;
  let total = 0;
  for (const f of forecasts) {
    let sumSq = 0;
    for (let k = 0; k < f.probabilities.length; k += 1) {
      const p = Math.max(0, Math.min(1, f.probabilities[k] ?? 0));
      const o = k === f.outcomeIndex ? 1 : 0;
      sumSq += (p - o) ** 2;
    }
    total += sumSq;
  }
  return roundTo(total / forecasts.length, 4);
}

/** Proper logarithmic scoring rule (log loss). Lower is better. */
export function calculateLogLoss(forecasts: readonly ResolvedMultiClassForecast[]): number | null {
  if (forecasts.length === 0) return null;
  let total = 0;
  for (const f of forecasts) {
    const pActual = Math.max(1e-6, Math.min(1, f.probabilities[f.outcomeIndex] ?? 0));
    total += -Math.log(pActual);
  }
  return roundTo(total / forecasts.length, 4);
}

/**
 * Murphy (1973) Brier Score decomposition: Brier = Reliability - Resolution + Uncertainty,
 * paired with 10%-wide calibration curve buckets.
 */
export function calculateMurphyDecomposition(
  forecasts: readonly ResolvedBinaryForecast[],
): MurphyDecomposition | null {
  if (forecasts.length === 0) return null;
  const n = forecasts.length;
  const baseRate = forecasts.filter((f) => f.occurred).length / n;
  const uncertainty = baseRate * (1 - baseRate);

  const grouped: ResolvedBinaryForecast[][] = Array.from({ length: 10 }, () => []);
  let rawBrier = 0;
  for (const f of forecasts) {
    const p = Math.max(0, Math.min(1, f.probability));
    const o = f.occurred ? 1 : 0;
    rawBrier += (p - o) ** 2;
    const idx = Math.min(9, Math.floor(p * 10));
    grouped[idx]?.push({ probability: p, occurred: f.occurred });
  }

  let reliability = 0;
  let resolution = 0;
  const buckets: CalibrationBucket[] = [];
  for (let b = 0; b < 10; b += 1) {
    const items = grouped[b] ?? [];
    if (items.length === 0) continue;
    const avgP = items.reduce((s, x) => s + x.probability, 0) / items.length;
    const obsRate = items.filter((x) => x.occurred).length / items.length;
    const weight = items.length / n;
    reliability += weight * (avgP - obsRate) ** 2;
    resolution += weight * (obsRate - baseRate) ** 2;
    buckets.push({
      bucketLabel: `${b * 10}-${(b + 1) * 10}%`,
      midpointPct: b * 10 + 5,
      count: items.length,
      avgForecastPct: roundTo(avgP * 100, 1),
      observedRatePct: roundTo(obsRate * 100, 1),
    });
  }

  return {
    brierScore: roundTo(rawBrier / n, 4),
    reliability: roundTo(reliability, 4),
    resolution: roundTo(resolution, 4),
    uncertainty: roundTo(uncertainty, 4),
    buckets,
  };
}

/** 2x2 Decision Process vs Outcome attribution matrix (Annie Duke / Michael Mauboussin). */
export function classifyProcessOutcomeMatrix(
  items: readonly ProcessOutcomeItem[],
): ProcessOutcomeMatrix {
  let deservedWin = 0;
  let dumbLuck = 0;
  let badBreak = 0;
  let expectedLoss = 0;
  for (const item of items) {
    if (item.goodProcess && item.goodOutcome) {
      deservedWin += 1;
      continue;
    }
    if (!item.goodProcess && item.goodOutcome) {
      dumbLuck += 1;
      continue;
    }
    if (item.goodProcess) {
      badBreak += 1;
      continue;
    }
    expectedLoss += 1;
  }
  return { deservedWin, dumbLuck, badBreak, expectedLoss, total: items.length };
}
