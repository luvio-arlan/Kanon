import {
  MAX_VALUATION_EPS,
  MAX_VALUATION_PE,
  MAX_VALUATION_PRICE,
  roundTo,
  type ValuationDriverInputs,
  type ValuationModelMode,
} from "@kanon/core";

export type CaseKey = "bear" | "base" | "bull";
export type CasePair = { eps: number; peMultiple: number; probability: number };
export type CaseMap = Record<CaseKey, CasePair>;

export interface ValuationDraftState {
  currentPrice: number;
  horizonYears: number;
  modelMode: ValuationModelMode;
  driverInputs: ValuationDriverInputs;
  cases: CaseMap;
}

export type ValuationSavePayload = {
  currentPrice: number;
  horizonYears: number;
  modelMode: ValuationModelMode;
  driverInputs: ValuationDriverInputs | null;
} & CaseMap;

function isBoundedCase(val: unknown): val is CasePair {
  if (!val || typeof val !== "object") return false;
  const c = val as { eps?: unknown; peMultiple?: unknown; probability?: unknown };
  const okEps =
    typeof c.eps === "number" && Number.isFinite(c.eps) && c.eps > 0 && c.eps <= MAX_VALUATION_EPS;
  const okPe =
    typeof c.peMultiple === "number" &&
    Number.isFinite(c.peMultiple) &&
    c.peMultiple > 0 &&
    c.peMultiple <= MAX_VALUATION_PE;
  const okProb =
    typeof c.probability === "number" &&
    Number.isFinite(c.probability) &&
    c.probability >= 0 &&
    c.probability <= 1;
  return okEps && okPe && okProb;
}

export function isValuationDraft(val: unknown): val is ValuationDraftState {
  if (!val || typeof val !== "object") return false;
  const rec = val as Record<string, unknown>;
  const okPrice =
    typeof rec.currentPrice === "number" &&
    Number.isFinite(rec.currentPrice) &&
    rec.currentPrice > 0 &&
    rec.currentPrice <= MAX_VALUATION_PRICE;
  const okHorizon =
    typeof rec.horizonYears === "number" &&
    Number.isFinite(rec.horizonYears) &&
    rec.horizonYears >= 1 &&
    rec.horizonYears <= 15;
  const okMode = rec.modelMode === "pe" || rec.modelMode === "ev_fcf";
  const okDrivers = Boolean(
    rec.driverInputs && typeof rec.driverInputs === "object" && !Array.isArray(rec.driverInputs),
  );
  if (
    !okPrice ||
    !okHorizon ||
    !okMode ||
    !okDrivers ||
    !rec.cases ||
    typeof rec.cases !== "object"
  ) {
    return false;
  }
  const cases = rec.cases as Record<string, unknown>;
  return isBoundedCase(cases.bear) && isBoundedCase(cases.base) && isBoundedCase(cases.bull);
}

export function clampCasePatch(prev: CasePair, next: Partial<CasePair>): CasePair {
  const eps =
    typeof next.eps === "number" && Number.isFinite(next.eps)
      ? Math.min(MAX_VALUATION_EPS, Math.max(0.01, next.eps))
      : prev.eps;
  const peMultiple =
    typeof next.peMultiple === "number" && Number.isFinite(next.peMultiple)
      ? Math.min(MAX_VALUATION_PE, Math.max(1, next.peMultiple))
      : prev.peMultiple;
  const probability =
    typeof next.probability === "number" && Number.isFinite(next.probability)
      ? Math.min(1, Math.max(0, next.probability))
      : prev.probability;
  return { eps, peMultiple, probability };
}

export function normalizeProbTriplet(bearRaw: number, baseRaw: number, bullRaw: number) {
  const b1 = Math.max(1, bearRaw);
  const b2 = Math.max(1, baseRaw);
  const b3 = Math.max(1, bullRaw);
  const total = b1 + b2 + b3;
  const bear = Math.round((b1 / total) * 100) / 100;
  const base = Math.round((b2 / total) * 100) / 100;
  return { bear, base, bull: Math.round((1 - bear - base) * 100) / 100 };
}

export function mapTargetsToCases(
  prev: CaseMap,
  targets: { bear: number; base: number; bull: number },
): CaseMap {
  const toEps = (price: number, pe: number) =>
    Math.min(MAX_VALUATION_EPS, Math.max(0.05, roundTo(price / Math.max(1, pe), 2)));
  return {
    bear: { ...prev.bear, eps: toEps(targets.bear, prev.bear.peMultiple) },
    base: { ...prev.base, eps: toEps(targets.base, prev.base.peMultiple) },
    bull: { ...prev.bull, eps: toEps(targets.bull, prev.bull.peMultiple) },
  };
}
