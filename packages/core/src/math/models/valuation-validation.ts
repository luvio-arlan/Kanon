import {
  MAX_VALUATION_EPS,
  MAX_VALUATION_PE,
  MAX_VALUATION_PRICE,
  type ValuationCaseInput,
  type ValuationInputIssue,
  type ValuationScenarioInput,
} from "../../schemas/thesis";

const DEFAULT_WEIGHTS = { bear: 0.25, base: 0.5, bull: 0.25 } as const;
const PROBABILITY_TOLERANCE = 0.001;

export type SanitizeValuationResult =
  | { ok: true; input: ValuationScenarioInput & { horizonYears: number } }
  | { ok: false; issues: ValuationInputIssue[] };

function validateCaseInput(
  key: "bear" | "base" | "bull",
  label: string,
  c: ValuationCaseInput,
  issues: ValuationInputIssue[],
) {
  if (!Number.isFinite(c.eps) || c.eps <= 0 || c.eps > MAX_VALUATION_EPS) {
    issues.push({
      field: `${key}.eps`,
      message: `${label} EPS 需为正数且不超过 ${MAX_VALUATION_EPS}。`,
    });
  }
  if (!Number.isFinite(c.peMultiple) || c.peMultiple <= 0 || c.peMultiple > MAX_VALUATION_PE) {
    issues.push({
      field: `${key}.peMultiple`,
      message: `${label} PE 倍数需在 (0, ${MAX_VALUATION_PE}] 之间。`,
    });
  }
}

function validateProbabilities(
  bear: ValuationCaseInput,
  base: ValuationCaseInput,
  bull: ValuationCaseInput,
  issues: ValuationInputIssue[],
): { bear: number; base: number; bull: number } | null {
  const vals = [bear.probability, base.probability, bull.probability];
  if (vals.every((v) => v === undefined)) return { ...DEFAULT_WEIGHTS };
  if (vals.some((v) => v === undefined)) {
    issues.push({
      field: "probabilities",
      message: "三情景概率权重需全部填写或全部省略。",
    });
    return null;
  }
  const b1 = bear.probability ?? 0;
  const b2 = base.probability ?? 0;
  const b3 = bull.probability ?? 0;
  const allValid =
    Number.isFinite(b1) &&
    Number.isFinite(b2) &&
    Number.isFinite(b3) &&
    b1 >= 0 &&
    b1 <= 1 &&
    b2 >= 0 &&
    b2 <= 1 &&
    b3 >= 0 &&
    b3 <= 1;
  if (!allValid || Math.abs(b1 + b2 + b3 - 1) > PROBABILITY_TOLERANCE) {
    issues.push({
      field: "probabilities",
      message: "三情景概率权重需在 0–100% 之间且总和等于 100%。",
    });
    return null;
  }
  return { bear: b1, base: b2, bull: b3 };
}

export function sanitizeValuationInput(raw: ValuationScenarioInput): SanitizeValuationResult {
  const issues: ValuationInputIssue[] = [];
  if (
    !Number.isFinite(raw.currentPrice) ||
    raw.currentPrice <= 0 ||
    raw.currentPrice > MAX_VALUATION_PRICE
  ) {
    issues.push({
      field: "currentPrice",
      message: `当前参考价需为正数且不超过 ${MAX_VALUATION_PRICE}。`,
    });
  }
  const rawHorizon = raw.horizonYears ?? 3;
  if (!Number.isFinite(rawHorizon) || rawHorizon < 1 || rawHorizon > 15) {
    issues.push({ field: "horizonYears", message: "估值周期需在 1 至 15 年之间。" });
  }
  validateCaseInput("bear", "悲观情景", raw.bear, issues);
  validateCaseInput("base", "中性情景", raw.base, issues);
  validateCaseInput("bull", "乐观情景", raw.bull, issues);
  const probs = validateProbabilities(raw.bear, raw.base, raw.bull, issues);
  if (issues.length > 0 || !probs) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    input: {
      currentPrice: raw.currentPrice,
      horizonYears: Math.round(rawHorizon),
      bear: { eps: raw.bear.eps, peMultiple: raw.bear.peMultiple, probability: probs.bear },
      base: { eps: raw.base.eps, peMultiple: raw.base.peMultiple, probability: probs.base },
      bull: { eps: raw.bull.eps, peMultiple: raw.bull.peMultiple, probability: probs.bull },
    },
  };
}

function clampDisplayCase(c: ValuationCaseInput, prob: number) {
  const eps = Number.isFinite(c.eps) ? Math.min(MAX_VALUATION_EPS, Math.max(0.01, c.eps)) : 0.01;
  const peMultiple = Number.isFinite(c.peMultiple)
    ? Math.min(MAX_VALUATION_PE, Math.max(0.1, c.peMultiple))
    : 1;
  return { eps, peMultiple, probability: prob };
}

export function clampDisplayValuationInput(
  raw: ValuationScenarioInput,
): ValuationScenarioInput & { horizonYears: number } {
  const currentPrice =
    Number.isFinite(raw.currentPrice) && raw.currentPrice > 0
      ? Math.min(MAX_VALUATION_PRICE, raw.currentPrice)
      : 1;
  const rawHorizon = raw.horizonYears ?? 3;
  const horizonYears = Number.isFinite(rawHorizon)
    ? Math.min(15, Math.max(1, Math.round(rawHorizon)))
    : 3;
  const issues: ValuationInputIssue[] = [];
  const probs = validateProbabilities(raw.bear, raw.base, raw.bull, issues) ?? {
    ...DEFAULT_WEIGHTS,
  };
  return {
    currentPrice,
    horizonYears,
    bear: clampDisplayCase(raw.bear, probs.bear),
    base: clampDisplayCase(raw.base, probs.base),
    bull: clampDisplayCase(raw.bull, probs.bull),
  };
}

export function hasInvalidValuationInput(params: {
  valuationInput: ValuationScenarioInput;
  valuationInputIssues?: readonly ValuationInputIssue[];
}): boolean {
  if ((params.valuationInputIssues?.length ?? 0) > 0) return true;
  return !sanitizeValuationInput(params.valuationInput).ok;
}
