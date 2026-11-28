export interface SymmetricEigenResult {
  eigenvalues: number[];
  /** Columns: eigenvectors[k] is the unit eigenvector corresponding to eigenvalues[k]. */
  eigenvectors: number[][];
  converged: boolean;
}

function rotateOffDiag(a: number[][], p: number, q: number, c: number, s: number, n: number) {
  const rowP = a[p];
  const rowQ = a[q];
  for (let i = 0; i < n; i += 1) {
    if (i === p || i === q) continue;
    const rowI = a[i];
    if (!rowI) continue;
    const aip = rowI[p] ?? 0;
    const aiq = rowI[q] ?? 0;
    const nip = c * aip - s * aiq;
    const niq = s * aip + c * aiq;
    rowI[p] = nip;
    rowI[q] = niq;
    if (rowP) rowP[i] = nip;
    if (rowQ) rowQ[i] = niq;
  }
}

function rotateBasisVectors(v: number[][], p: number, q: number, c: number, s: number, n: number) {
  for (let i = 0; i < n; i += 1) {
    const row = v[i];
    if (!row) continue;
    const vip = row[p] ?? 0;
    const viq = row[q] ?? 0;
    row[p] = c * vip - s * viq;
    row[q] = s * vip + c * viq;
  }
}

function applyJacobiRotation(a: number[][], v: number[][], p: number, q: number, n: number) {
  const app = a[p]?.[p] ?? 0;
  const aqq = a[q]?.[q] ?? 0;
  const apq = a[p]?.[q] ?? 0;
  if (Math.abs(apq) <= 1e-15) return;
  const tau = (aqq - app) / (2 * apq);
  const t =
    tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
  const c = 1 / Math.sqrt(1 + t * t);
  const s = t * c;
  rotateOffDiag(a, p, q, c, s, n);
  const rowP = a[p];
  const rowQ = a[q];
  if (rowP && rowQ) {
    rowP[p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    rowQ[q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    rowP[q] = 0;
    rowQ[p] = 0;
  }
  rotateBasisVectors(v, p, q, c, s, n);
}

function runCyclicSweep(a: number[][], v: number[][], n: number): number {
  let maxOffDiag = 0;
  for (let p = 0; p < n; p += 1) {
    for (let q = p + 1; q < n; q += 1) {
      const val = Math.abs(a[p]?.[q] ?? 0);
      if (val > maxOffDiag) maxOffDiag = val;
      if (val > 1e-14) applyJacobiRotation(a, v, p, q, n);
    }
  }
  return maxOffDiag;
}

/**
 * Cyclic-sweep Jacobi eigendecomposition for real symmetric N x N matrices (S2 Meucci ENB / P2-4).
 * Uses full cyclic sweeps (O(N^2) per sweep) and reports explicit convergence status.
 */
export function jacobiSymmetricEigen(matrix: readonly (readonly number[])[]): SymmetricEigenResult {
  const n = matrix.length;
  if (n === 0) return { eigenvalues: [], eigenvectors: [], converged: true };
  if (n === 1) return { eigenvalues: [matrix[0]?.[0] ?? 0], eigenvectors: [[1]], converged: true };

  const a = matrix.map((row, i) =>
    row.map((_, j) => 0.5 * ((matrix[i]?.[j] ?? 0) + (matrix[j]?.[i] ?? 0))),
  );
  const v = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  let converged = false;
  for (let sweep = 0; sweep < 50; sweep += 1) {
    if (runCyclicSweep(a, v, n) < 1e-12) {
      converged = true;
      break;
    }
  }
  const pairs = Array.from({ length: n }, (_, k) => ({
    val: a[k]?.[k] ?? 0,
    vec: Array.from({ length: n }, (_, i) => v[i]?.[k] ?? 0),
  })).sort((x, y) => y.val - x.val);
  return {
    eigenvalues: pairs.map((p) => p.val),
    eigenvectors: pairs.map((p) => p.vec),
    converged,
  };
}
