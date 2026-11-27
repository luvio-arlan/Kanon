import type { CorrelationCluster } from "../../contracts/analytics";
import { roundTo } from "../valuation-scenarios";

export const CORRELATED_CLUSTER_CAP_PCT = 35;

function averageCrossCorr(
  a: readonly number[],
  b: readonly number[],
  corr: readonly (readonly number[])[],
): number {
  let sum = 0;
  let count = 0;
  for (const i of a) {
    for (const j of b) {
      sum += corr[i]?.[j] ?? 0;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

function findBestMergePair(
  clusters: readonly (readonly number[])[],
  corr: readonly (readonly number[])[],
): { i: number; j: number; avgCorr: number } | null {
  let best: { i: number; j: number; avgCorr: number } | null = null;
  for (let i = 0; i < clusters.length; i += 1) {
    for (let j = i + 1; j < clusters.length; j += 1) {
      const avg = averageCrossCorr(clusters[i] ?? [], clusters[j] ?? [], corr);
      if (!best || avg > best.avgCorr) best = { i, j, avgCorr: avg };
    }
  }
  return best;
}

function computeIntraCorr(
  indices: readonly number[],
  corr: readonly (readonly number[])[],
): number {
  if (indices.length <= 1) return 1;
  let sum = 0;
  let pairs = 0;
  for (let a = 0; a < indices.length; a += 1) {
    for (let b = a + 1; b < indices.length; b += 1) {
      sum += corr[indices[a] ?? 0]?.[indices[b] ?? 0] ?? 0;
      pairs += 1;
    }
  }
  return pairs > 0 ? roundTo(sum / pairs, 2) : 1;
}

/**
 * Average-linkage correlation clustering (Mantegna distance) grouping holdings with avg pairwise rho >= threshold (S2).
 * Flags any multi-asset cluster exceeding `CORRELATED_CLUSTER_CAP_PCT` (35%).
 */
export function clusterCorrelations(params: {
  tickers: readonly string[];
  weightsPct: readonly number[];
  correlation: readonly (readonly number[])[];
  threshold?: number;
}): CorrelationCluster[] {
  const threshold = params.threshold ?? 0.65;
  const groups: number[][] = params.tickers.map((_, idx) => [idx]);
  while (groups.length > 1) {
    const best = findBestMergePair(groups, params.correlation);
    if (!best || best.avgCorr < threshold) break;
    const merged = [...(groups[best.i] ?? []), ...(groups[best.j] ?? [])];
    groups.splice(best.j, 1);
    groups.splice(best.i, 1, merged);
  }
  return groups
    .map((indices, idx) => {
      const tickers = indices.map((i) => params.tickers[i] ?? "").filter(Boolean);
      const combinedWeightPct = roundTo(
        indices.reduce((s, i) => s + (params.weightsPct[i] ?? 0), 0),
        2,
      );
      const avgIntraCorr = computeIntraCorr(indices, params.correlation);
      return {
        id: `cluster-${idx + 1}`,
        tickers,
        combinedWeightPct,
        avgIntraCorr,
        exceedsCap: tickers.length >= 2 && combinedWeightPct > CORRELATED_CLUSTER_CAP_PCT,
      };
    })
    .sort((a, b) => b.combinedWeightPct - a.combinedWeightPct);
}
