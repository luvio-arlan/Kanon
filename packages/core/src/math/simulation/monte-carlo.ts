import { roundTo } from "../valuation-scenarios";
import { choleskyDecompose, createMulberry32, sampleCorrelatedNormals } from "./prng";

export interface NormalParam {
  mean: number;
  stdDev: number;
  min?: number;
  max?: number;
}

export interface MonteCarloValuationInput {
  seed: number;
  iterations: number;
  currentPrice: number;
  targetPrice?: number;
  baseRevenueB: number;
  dilutedSharesM: number;
  netCashB: number;
  horizonYears: number;
  taxRatePct: number;
  revenueCagrPct: NormalParam;
  operatingMarginPct: NormalParam;
  exitMultiple: NormalParam;
  /** Optional 3x3 correlation matrix for [revenueCagr, operatingMargin, exitMultiple]. */
  correlationMatrix?: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
}

export interface MonteCarloValuationResult {
  seed: number;
  iterations: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  mean: number;
  probExceedCurrentPricePct: number;
  probExceedTargetPct: number;
  sensitivityPearson: {
    revenueCagr: number;
    operatingMargin: number;
    exitMultiple: number;
  };
}

const DEFAULT_CORR: readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
] = [
  [1, 0.35, 0.45],
  [0.35, 1, 0.3],
  [0.45, 0.3, 1],
];

function clampParam(value: number, p: NormalParam): number {
  const lo = p.min ?? -Infinity;
  const hi = p.max ?? Infinity;
  return Math.max(lo, Math.min(hi, value));
}

function quantile(sorted: readonly number[], q: number): number {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (idx - lo);
}

function pearsonCorrelation(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += xs[i] ?? 0;
    sumY += ys[i] ?? 0;
  }
  const mx = sumX / n;
  const my = sumY / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx <= 1e-12 || vy <= 1e-12) return 0;
  return roundTo(cov / Math.sqrt(vx * vy), 3);
}

function simulateSingleDraw(
  input: MonteCarloValuationInput,
  rng: () => number,
  chol: readonly (readonly number[])[],
  years: number,
  shares: number,
  tax: number,
) {
  const [zG = 0, zM = 0, zX = 0] = sampleCorrelatedNormals(rng, chol);
  const g = clampParam(
    input.revenueCagrPct.mean + zG * input.revenueCagrPct.stdDev,
    input.revenueCagrPct,
  );
  const m = clampParam(
    input.operatingMarginPct.mean + zM * input.operatingMarginPct.stdDev,
    input.operatingMarginPct,
  );
  const mult = clampParam(
    input.exitMultiple.mean + zX * input.exitMultiple.stdDev,
    input.exitMultiple,
  );
  const terminalRevB = Math.max(0.01, input.baseRevenueB) * Math.max(0.05, 1 + g / 100) ** years;
  const terminalNopatB = terminalRevB * (m / 100) * (1 - tax);
  const equityValB = Math.max(0, terminalNopatB * Math.max(1, mult) + input.netCashB);
  return { perShare: (equityValB * 1000) / shares, g, m, mult };
}

/**
 * Deterministic Cholesky-correlated valuation Monte Carlo engine.
 * Projects N-year terminal revenue, NOPAT, EV, and per-share equity value across seeded draws.
 */
export function runValuationMonteCarlo(input: MonteCarloValuationInput): MonteCarloValuationResult {
  const n = Math.max(100, Math.min(20_000, Math.round(input.iterations)));
  const rng = createMulberry32(input.seed);
  const chol = choleskyDecompose(input.correlationMatrix ?? DEFAULT_CORR);
  const years = Math.max(1, Math.min(10, Math.round(input.horizonYears)));
  const shares = Math.max(0.01, input.dilutedSharesM);
  const tax = Math.max(0, Math.min(0.6, input.taxRatePct / 100));
  const target = input.targetPrice ?? input.currentPrice * 1.5;

  const prices: number[] = [];
  const gSamples: number[] = [];
  const mSamples: number[] = [];
  const xSamples: number[] = [];
  let sumPrices = 0;
  let aboveCurrent = 0;
  let aboveTarget = 0;

  for (let i = 0; i < n; i += 1) {
    const draw = simulateSingleDraw(input, rng, chol, years, shares, tax);
    prices.push(draw.perShare);
    gSamples.push(draw.g);
    mSamples.push(draw.m);
    xSamples.push(draw.mult);
    sumPrices += draw.perShare;
    if (draw.perShare > input.currentPrice) aboveCurrent += 1;
    if (draw.perShare >= target) aboveTarget += 1;
  }

  const sorted = [...prices].sort((a, b) => a - b);
  return {
    seed: input.seed,
    iterations: n,
    p5: roundTo(quantile(sorted, 0.05), 2),
    p10: roundTo(quantile(sorted, 0.1), 2),
    p25: roundTo(quantile(sorted, 0.25), 2),
    p50: roundTo(quantile(sorted, 0.5), 2),
    p75: roundTo(quantile(sorted, 0.75), 2),
    p90: roundTo(quantile(sorted, 0.9), 2),
    p95: roundTo(quantile(sorted, 0.95), 2),
    mean: roundTo(sumPrices / n, 2),
    probExceedCurrentPricePct: roundTo((aboveCurrent / n) * 100, 1),
    probExceedTargetPct: roundTo((aboveTarget / n) * 100, 1),
    sensitivityPearson: {
      revenueCagr: pearsonCorrelation(gSamples, prices),
      operatingMargin: pearsonCorrelation(mSamples, prices),
      exitMultiple: pearsonCorrelation(xSamples, prices),
    },
  };
}
