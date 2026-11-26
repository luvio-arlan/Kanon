/**
 * Deterministic 32-bit PRNG (Mulberry32) for reproducible Monte Carlo simulations.
 * Zero dependency on Math.random() — identical seed guarantees bit-for-bit identical draws.
 */
export function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform producing an N(0, 1) draw from a deterministic U(0, 1) generator. */
export function sampleStandardNormal(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function computeCholeskyCell(
  matrix: readonly (readonly number[])[],
  lower: number[][],
  i: number,
  j: number,
): number {
  let sum = 0;
  for (let k = 0; k < j; k += 1) {
    sum += (lower[i]?.[k] ?? 0) * (lower[j]?.[k] ?? 0);
  }
  if (i === j) {
    return Math.sqrt(Math.max(1e-6, (matrix[i]?.[i] ?? 1) - sum));
  }
  return ((matrix[i]?.[j] ?? 0) - sum) / (lower[j]?.[j] ?? 1);
}

/**
 * Lower-triangular Cholesky decomposition L of symmetric positive-definite matrix A = L * L^T.
 * Falls back to diagonal floor (1e-6) if slightly near-singular due to user-entered correlations.
 */
export function choleskyDecompose(matrix: readonly (readonly number[])[]): number[][] {
  const n = matrix.length;
  const lower: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    const row = lower[i];
    if (!row) continue;
    for (let j = 0; j <= i; j += 1) {
      row[j] = computeCholeskyCell(matrix, lower, i, j);
    }
  }
  return lower;
}

export function sampleCorrelatedNormals(
  rng: () => number,
  choleskyLower: readonly (readonly number[])[],
): number[] {
  const n = choleskyLower.length;
  const z = Array.from({ length: n }, () => sampleStandardNormal(rng));
  const out = Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let acc = 0;
    for (let j = 0; j <= i; j += 1) {
      acc += (choleskyLower[i]?.[j] ?? 0) * (z[j] ?? 0);
    }
    out[i] = acc;
  }
  return out;
}
