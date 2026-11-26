import { roundTo } from "../valuation-scenarios";

export interface DiscreteKellyScenario {
  probability: number;
  returnPct: number;
}

export interface KellyAdjustmentOption {
  id: string;
  label: string;
  enabled: boolean;
  multiplier: number;
}

export interface KellyAdjustmentDetail extends KellyAdjustmentOption {
  beforePct: number;
  afterPct: number;
}

export interface DiscreteKellyInput {
  scenarios: readonly DiscreteKellyScenario[];
  fraction?: number;
  capPct: number;
  adjustments?: readonly KellyAdjustmentOption[];
}

export interface DiscreteKellyResult {
  fullKellyFraction: number;
  fullKellyPct: number;
  fractionalKellyPct: number;
  cappedPct: number;
  expectedLogGrowth: number;
  probabilityOfLoss: number;
  adjustments: KellyAdjustmentDetail[];
}

interface NormalizedOutcome {
  p: number;
  r: number;
}

function normalizeOutcomes(scenarios: readonly DiscreteKellyScenario[]): NormalizedOutcome[] {
  const valid = scenarios
    .filter(
      (s) => Number.isFinite(s.probability) && s.probability > 0 && Number.isFinite(s.returnPct),
    )
    .map((s) => ({ p: s.probability, r: s.returnPct / 100 }));
  const sumP = valid.reduce((acc, o) => acc + o.p, 0);
  if (sumP <= 0) return [];
  return valid.map((o) => ({ p: o.p / sumP, r: o.r }));
}

function evalDerivatives(outcomes: readonly NormalizedOutcome[], f: number) {
  let d1 = 0;
  let d2 = 0;
  for (const { p, r } of outcomes) {
    const denom = 1 + f * r;
    const ratio = r / denom;
    d1 += p * ratio;
    d2 -= p * ratio * ratio;
  }
  return { d1, d2 };
}

function evalLogGrowth(outcomes: readonly NormalizedOutcome[], f: number): number {
  let sum = 0;
  for (const { p, r } of outcomes) {
    const gross = 1 + f * r;
    if (gross <= 0) return Number.NEGATIVE_INFINITY;
    sum += p * Math.log(gross);
  }
  return sum;
}

function computeUpperBound(outcomes: readonly NormalizedOutcome[]): number | null {
  let minR = Number.POSITIVE_INFINITY;
  for (const o of outcomes) {
    if (o.r < minR) minR = o.r;
  }
  if (minR >= 0) return null;
  return minR <= -1 ? Math.min(1, (-1 / minR) * (1 - 1e-9)) : 1;
}

function solveInteriorRoot(outcomes: readonly NormalizedOutcome[], upperBound: number): number {
  let lo = 0;
  let hi = upperBound;
  let f = 0.5 * (lo + hi);
  for (let i = 0; i < 60; i += 1) {
    const { d1, d2 } = evalDerivatives(outcomes, f);
    if (Math.abs(d1) < 1e-12 || hi - lo < 1e-12) break;
    if (d1 > 0) lo = f;
    else hi = f;
    const newton = d2 < -1e-15 ? f - d1 / d2 : Number.NaN;
    f = newton > lo && newton < hi ? newton : 0.5 * (lo + hi);
  }
  return Math.max(0, Math.min(upperBound, f));
}

function solveOptimalFraction(outcomes: readonly NormalizedOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const expectedReturn = outcomes.reduce((acc, o) => acc + o.p * o.r, 0);
  if (expectedReturn <= 0) return 0;
  const upperBound = computeUpperBound(outcomes);
  if (upperBound === null) return 1;
  if (evalDerivatives(outcomes, upperBound).d1 >= 0) return upperBound;
  return solveInteriorRoot(outcomes, upperBound);
}

function applyAdjustments(
  basePct: number,
  options: readonly KellyAdjustmentOption[],
): { adjustedPct: number; details: KellyAdjustmentDetail[] } {
  let current = basePct;
  const details: KellyAdjustmentDetail[] = [];
  for (const opt of options) {
    const mult = opt.enabled ? Math.max(0, Math.min(1, opt.multiplier)) : 1;
    const next = current * mult;
    details.push({
      ...opt,
      beforePct: roundTo(current, 2),
      afterPct: roundTo(next, 2),
    });
    current = next;
  }
  return { adjustedPct: current, details };
}

export function calculateDiscreteKelly(input: DiscreteKellyInput): DiscreteKellyResult {
  const outcomes = normalizeOutcomes(input.scenarios);
  const fraction = Math.max(0, Math.min(1, input.fraction ?? 0.5));
  const capPct = Math.max(0, Math.min(100, input.capPct));
  const probLoss = outcomes.reduce((acc, o) => (o.r < 0 ? acc + o.p : acc), 0);

  const fStar = solveOptimalFraction(outcomes);
  const fullKellyPct = roundTo(fStar * 100, 2);
  const fractionalKellyPct = roundTo(fStar * fraction * 100, 2);
  const { adjustedPct, details } = applyAdjustments(fractionalKellyPct, input.adjustments ?? []);
  const cappedPct = roundTo(Math.min(capPct, Math.max(0, adjustedPct)), 1);
  const appliedF = cappedPct / 100;
  const expectedLogGrowth =
    outcomes.length > 0 && appliedF > 0 ? roundTo(evalLogGrowth(outcomes, appliedF), 6) : 0;

  return {
    fullKellyFraction: fStar,
    fullKellyPct,
    fractionalKellyPct,
    cappedPct,
    expectedLogGrowth,
    probabilityOfLoss: roundTo(probLoss, 4),
    adjustments: details,
  };
}
