import type { ValuationScenarioSummary } from "../schemas/thesis";
import { roundTo } from "./valuation-scenarios";

export type ProbabilityPresetId = "balanced" | "conservative" | "conviction";

export interface ProbabilityPreset {
  id: ProbabilityPresetId;
  label: string;
  bear: number;
  base: number;
  bull: number;
}

export const PROBABILITY_PRESETS: readonly ProbabilityPreset[] = [
  { id: "balanced", label: "均衡 25/50/25", bear: 0.25, base: 0.5, bull: 0.25 },
  { id: "conservative", label: "审慎 40/45/15", bear: 0.4, base: 0.45, bull: 0.15 },
  { id: "conviction", label: "高确信 15/55/30", bear: 0.15, base: 0.55, bull: 0.3 },
];

export interface ImpliedExpectations {
  marginOfSafetyPct: number;
  expectedMarginOfSafetyPct: number;
  hurdleEntry15: number;
  hurdleEntry20: number;
  isBelowHurdle15: boolean;
  impliedEpsAtBasePe: number;
  impliedEpsCagrPct: number | null;
  baseEpsCagrPct: number | null;
  expectationsGapPct: number | null;
}

function safeCagrPct(start: number, end: number, years: number): number | null {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return roundTo(((end / start) ** (1 / years) - 1) * 100, 1);
}

export function matchProbabilityPreset(
  bear: number,
  base: number,
  bull: number,
): ProbabilityPresetId | null {
  const hit = PROBABILITY_PRESETS.find(
    (p) =>
      Math.abs(p.bear - bear) < 0.01 &&
      Math.abs(p.base - base) < 0.01 &&
      Math.abs(p.bull - bull) < 0.01,
  );
  return hit?.id ?? null;
}

export function calculateImpliedExpectations(params: {
  summary: ValuationScenarioSummary;
  trailingEps?: number | null;
}): ImpliedExpectations {
  const { summary, trailingEps } = params;
  const price = summary.currentPrice;
  const baseTarget = summary.base.targetPrice;
  const expTarget = summary.expectedTargetPrice;
  const years = Math.max(1, summary.horizonYears);

  const marginOfSafetyPct =
    baseTarget > 0 ? roundTo(((baseTarget - price) / baseTarget) * 100, 1) : 0;
  const expectedMarginOfSafetyPct =
    expTarget > 0 ? roundTo(((expTarget - price) / expTarget) * 100, 1) : 0;
  const hurdleEntry15 = roundTo(baseTarget / 1.15 ** years, 2);
  const hurdleEntry20 = roundTo(baseTarget / 1.2 ** years, 2);
  const impliedEpsAtBasePe =
    summary.base.peMultiple > 0 ? roundTo(price / summary.base.peMultiple, 2) : 0;

  const hasValidTrailing = typeof trailingEps === "number" && trailingEps > 0;
  const impliedEpsCagrPct = hasValidTrailing
    ? safeCagrPct(trailingEps, impliedEpsAtBasePe, years)
    : null;
  const baseEpsCagrPct = hasValidTrailing
    ? safeCagrPct(trailingEps, summary.base.eps, years)
    : null;
  const expectationsGapPct =
    impliedEpsCagrPct !== null && baseEpsCagrPct !== null
      ? roundTo(baseEpsCagrPct - impliedEpsCagrPct, 1)
      : null;

  return {
    marginOfSafetyPct,
    expectedMarginOfSafetyPct,
    hurdleEntry15,
    hurdleEntry20,
    isBelowHurdle15: price <= hurdleEntry15,
    impliedEpsAtBasePe,
    impliedEpsCagrPct,
    baseEpsCagrPct,
    expectationsGapPct,
  };
}
