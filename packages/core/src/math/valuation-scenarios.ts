import {
  type ConvictionZone,
  type ValuationCaseInput,
  type ValuationCaseResult,
  type ValuationScenarioInput,
  ValuationScenarioInputSchema,
  type ValuationScenarioSummary,
} from "../schemas/thesis";

export {
  clampDisplayValuationInput,
  hasInvalidValuationInput,
  type SanitizeValuationResult,
  sanitizeValuationInput,
} from "./models/valuation-validation";

const DEFAULT_WEIGHTS = { bear: 0.25, base: 0.5, bull: 0.25 } as const;
const PROBABILITY_TOLERANCE = 0.001;

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const adjusted = value + Math.sign(value) * Number.EPSILON;
  const rounded = Math.round(adjusted * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function resolveWeights(
  bear: ValuationCaseInput,
  base: ValuationCaseInput,
  bull: ValuationCaseInput,
): { bear: number; base: number; bull: number } {
  const provided = [bear.probability, base.probability, bull.probability];
  if (provided.every((weight) => weight === undefined)) {
    return { ...DEFAULT_WEIGHTS };
  }
  if (provided.some((weight) => weight === undefined)) {
    throw new Error("Provide probabilities for all three scenarios or omit all three.");
  }
  const bearW = bear.probability ?? DEFAULT_WEIGHTS.bear;
  const baseW = base.probability ?? DEFAULT_WEIGHTS.base;
  const bullW = bull.probability ?? DEFAULT_WEIGHTS.bull;
  const total = bearW + baseW + bullW;
  if (Math.abs(total - 1) > PROBABILITY_TOLERANCE) {
    throw new Error(`Scenario probabilities must sum to 1.0 (received ${roundTo(total, 4)}).`);
  }
  return { bear: bearW, base: baseW, bull: bullW };
}

function evaluateCase(
  scenario: ValuationCaseInput,
  currentPrice: number,
  horizonYears: number,
  probability: number,
): ValuationCaseResult {
  const targetPrice = roundTo(scenario.eps * scenario.peMultiple, 2);
  const returnPct = roundTo(((targetPrice - currentPrice) / currentPrice) * 100, 1);
  const cagrPct = roundTo(((targetPrice / currentPrice) ** (1 / horizonYears) - 1) * 100, 1);
  return {
    eps: scenario.eps,
    peMultiple: scenario.peMultiple,
    probability: roundTo(probability, 4),
    targetPrice,
    returnPct,
    cagrPct,
  };
}

function computeRatio(
  targetPrice: number,
  bearTargetPrice: number,
  currentPrice: number,
): number | null {
  if (targetPrice <= currentPrice) return 0;
  if (bearTargetPrice >= currentPrice) return null;
  return roundTo((targetPrice - currentPrice) / (currentPrice - bearTargetPrice), 2);
}

function classifyConvictionZone(ratio: number | null, upsidePct: number): ConvictionZone {
  if (ratio === null) {
    return upsidePct > 0 ? "attractive" : "stretched";
  }
  if (ratio >= 2.5) return "attractive";
  if (ratio >= 1.2) return "balanced";
  return "stretched";
}

export function calculatePriceMarkerPosition(
  currentPrice: number,
  bearTargetPrice: number,
  bullTargetPrice: number,
): number {
  const span = bullTargetPrice - bearTargetPrice;
  if (span <= 0) return 50;
  const rawPct = ((currentPrice - bearTargetPrice) / span) * 100;
  return roundTo(Math.min(100, Math.max(0, rawPct)), 1);
}

export function calculateAverageRiskReward(ratios: readonly (number | null)[]): number | null {
  const finite = ratios.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (finite.length === 0) return null;
  const total = finite.reduce((sum, value) => sum + value, 0);
  return roundTo(total / finite.length, 2);
}

export function checkScenarioMonotonicity(p: {
  bearTarget: number;
  baseTarget: number;
  bullTarget: number;
}) {
  if (p.bearTarget >= p.baseTarget) {
    return { isMonotonic: false, warning: "悲观目标价不低于中性基准，建议核对情景假设单调性。" };
  }
  if (p.baseTarget >= p.bullTarget) {
    return { isMonotonic: false, warning: "中性目标价不低于乐观情景，建议拉大三情景区分度。" };
  }
  return { isMonotonic: true, warning: null };
}

export function calculateValuationScenarios(
  rawInput: ValuationScenarioInput,
): ValuationScenarioSummary {
  const parsed = ValuationScenarioInputSchema.parse(rawInput);
  const weights = resolveWeights(parsed.bear, parsed.base, parsed.bull);

  const bear = evaluateCase(parsed.bear, parsed.currentPrice, parsed.horizonYears, weights.bear);
  const base = evaluateCase(parsed.base, parsed.currentPrice, parsed.horizonYears, weights.base);
  const bull = evaluateCase(parsed.bull, parsed.currentPrice, parsed.horizonYears, weights.bull);

  const downsidePct = roundTo(
    ((parsed.currentPrice - bear.targetPrice) / parsed.currentPrice) * 100,
    1,
  );
  const riskRewardRatio = computeRatio(base.targetPrice, bear.targetPrice, parsed.currentPrice);
  const bullRiskRewardRatio = computeRatio(bull.targetPrice, bear.targetPrice, parsed.currentPrice);
  const expectedTargetPrice = roundTo(
    bear.targetPrice * bear.probability +
      base.targetPrice * base.probability +
      bull.targetPrice * bull.probability,
    2,
  );
  const expectedReturnPct = roundTo(
    ((expectedTargetPrice - parsed.currentPrice) / parsed.currentPrice) * 100,
    1,
  );

  return {
    currentPrice: roundTo(parsed.currentPrice, 2),
    horizonYears: parsed.horizonYears,
    bear,
    base,
    bull,
    upsidePct: base.returnPct,
    bullUpsidePct: bull.returnPct,
    downsidePct,
    riskRewardRatio,
    bullRiskRewardRatio,
    isAsymmetricFloor: bear.targetPrice >= parsed.currentPrice,
    expectedTargetPrice,
    expectedReturnPct,
    convictionZone: classifyConvictionZone(riskRewardRatio, base.returnPct),
  };
}
