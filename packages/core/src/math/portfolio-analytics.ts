import type { ThesisDetail } from "../schemas/research";
import { calculateImpliedExpectations } from "./implied-expectations";
import { calculateResearchReadiness } from "./research-readiness";
import {
  calculateDiscreteKelly,
  type DiscreteKellyResult,
  type KellyAdjustmentDetail,
} from "./sizing/kelly-discrete";
import {
  calculateAverageRiskReward,
  hasInvalidValuationInput,
  roundTo,
} from "./valuation-scenarios";

export interface SectorExposure {
  sector: string;
  weightPct: number;
  count: number;
  overConcentrated: boolean;
}

export interface KellySizingOptions {
  fraction?: number;
  applyReadinessDiscount?: boolean;
  applyWarningHalving?: boolean;
}

export interface KellyWeightSuggestion {
  minPct: number;
  maxPct: number;
  rationale: string;
  fullKellyPct?: number;
  expectedLogGrowth?: number;
  probabilityOfLoss?: number;
  adjustments?: KellyAdjustmentDetail[];
  discreteKelly?: DiscreteKellyResult;
}

export interface PortfolioAnalytics {
  activeCount: number;
  archivedCount: number;
  validatedHypotheses: number;
  watchingHypotheses: number;
  warningHypotheses: number;
  totalHypotheses: number;
  averageRiskReward: number | null;
  averageBaseCagrPct: number | null;
  averageMarginOfSafetyPct: number | null;
  averageReadinessPct: number;
  attractiveCount: number;
  balancedCount: number;
  stretchedCount: number;
  totalWeightPct: number;
  cashBufferPct: number;
  weightedBaseCagrPct: number | null;
  sectorExposures: SectorExposure[];
  overCapTickers: string[];
  inBuyZoneCount: number;
  warningThesisCount: number;
}

function averageFinite(values: readonly number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return null;
  return roundTo(valid.reduce((s, v) => s + v, 0) / valid.length, 1);
}

function tallyHypotheses(active: readonly ThesisDetail[]) {
  const all = active.flatMap((item) => item.hypotheses);
  return {
    validated: all.filter((h) => h.status === "validated").length,
    watching: all.filter((h) => h.status === "watching").length,
    warning: all.filter((h) => h.status === "warning").length,
  };
}

function primarySectorName(sectorTag: string): string {
  return sectorTag.split(/[·/]/)[0]?.trim() || sectorTag.trim() || "其他";
}

function computeSectorExposures(active: readonly ThesisDetail[]): SectorExposure[] {
  const map = new Map<string, { weightPct: number; count: number }>();
  for (const item of active) {
    const sector = primarySectorName(item.sectorTag);
    const curr = map.get(sector) ?? { weightPct: 0, count: 0 };
    map.set(sector, {
      weightPct: roundTo(curr.weightPct + Math.max(0, item.currentWeightPct), 1),
      count: curr.count + 1,
    });
  }
  return [...map.entries()]
    .map(([sector, stats]) => ({
      sector,
      weightPct: stats.weightPct,
      count: stats.count,
      overConcentrated: stats.weightPct > 35,
    }))
    .sort((a, b) => b.weightPct - a.weightPct);
}

function computePositionMetrics(active: readonly ThesisDetail[]) {
  const totalWeightPct = roundTo(
    active.reduce((sum, item) => sum + Math.max(0, item.currentWeightPct), 0),
    1,
  );
  const weightedBaseCagrPct =
    totalWeightPct > 0
      ? roundTo(
          active.reduce(
            (sum, item) => sum + Math.max(0, item.currentWeightPct) * item.valuation.base.cagrPct,
            0,
          ) / totalWeightPct,
          1,
        )
      : null;
  const overCapTickers = active
    .filter((item) => item.currentWeightPct > item.targetMaxWeightPct)
    .map((item) => item.ticker);
  const inBuyZoneCount = active.filter(
    (item) => calculateImpliedExpectations({ summary: item.valuation }).isBelowHurdle15,
  ).length;
  const warningThesisCount = active.filter((item) =>
    item.hypotheses.some((h) => h.status === "warning"),
  ).length;

  return {
    totalWeightPct,
    cashBufferPct: Math.max(0, roundTo(100 - totalWeightPct, 1)),
    weightedBaseCagrPct,
    sectorExposures: computeSectorExposures(active),
    overCapTickers,
    inBuyZoneCount,
    warningThesisCount,
  };
}

function buildKellyAdjustments(
  readiness: number,
  hasWarning: boolean,
  options?: KellySizingOptions,
) {
  return [
    {
      id: "readiness_discount",
      label: `研究成熟度系数 (${readiness}%)`,
      enabled: options?.applyReadinessDiscount ?? true,
      multiplier: roundTo(0.72 + (readiness / 100) * 0.28, 3),
    },
    {
      id: "warning_halving",
      label: "预警假设折半",
      enabled: (options?.applyWarningHalving ?? true) && hasWarning,
      multiplier: 0.5,
    },
  ];
}

function formatKellySuggestion(kelly: DiscreteKellyResult): KellyWeightSuggestion {
  if (kelly.fullKellyFraction <= 0) {
    return {
      minPct: 0,
      maxPct: 0,
      rationale: "三情景离散期望回报未达正对数效用，建议 0% 观察。",
      fullKellyPct: 0,
      expectedLogGrowth: 0,
      probabilityOfLoss: kelly.probabilityOfLoss,
      adjustments: kelly.adjustments,
      discreteKelly: kelly,
    };
  }
  const boundedMax = Math.round(kelly.cappedPct);
  const minPct =
    boundedMax < 2 ? 0 : Math.min(boundedMax, Math.max(2, Math.floor(boundedMax * 0.55)));
  const activeTags = kelly.adjustments
    .filter((a) => a.enabled && a.multiplier < 1)
    .map((a) => a.label);
  const suffix =
    activeTags.length > 0 ? `（含 ${activeTags.join("、")}）` : "（半凯利并受单票上限约束）";
  return {
    minPct,
    maxPct: boundedMax,
    rationale: `离散三情景全凯利 ${kelly.fullKellyPct}% · 亏损概率 ${Math.round(kelly.probabilityOfLoss * 100)}%${suffix}`,
    fullKellyPct: kelly.fullKellyPct,
    expectedLogGrowth: kelly.expectedLogGrowth,
    probabilityOfLoss: kelly.probabilityOfLoss,
    adjustments: kelly.adjustments,
    discreteKelly: kelly,
  };
}

export function suggestKellyCappedWeight(
  thesis: ThesisDetail,
  options?: KellySizingOptions,
): KellyWeightSuggestion {
  const cap = Math.max(1, Math.min(25, thesis.targetMaxWeightPct));
  if (hasInvalidValuationInput(thesis)) {
    return { minPct: 0, maxPct: 0, rationale: "估值输入待完善，暂不测算凯利仓位。" };
  }
  if (thesis.status === "archived_veto" || thesis.valuation.upsidePct <= 0) {
    return { minPct: 0, maxPct: 0, rationale: "当前已否决或中性空间不足，建议保持 0% 观察。" };
  }
  const readiness = calculateResearchReadiness(thesis).scorePct;
  const hasWarning = thesis.hypotheses.some((h) => h.status === "warning");
  const { bear, base, bull } = thesis.valuation;
  const kelly = calculateDiscreteKelly({
    scenarios: [
      { probability: bear.probability, returnPct: bear.returnPct },
      { probability: base.probability, returnPct: base.returnPct },
      { probability: bull.probability, returnPct: bull.returnPct },
    ],
    fraction: options?.fraction ?? 0.5,
    capPct: cap,
    adjustments: buildKellyAdjustments(readiness, hasWarning, options),
  });
  return formatKellySuggestion(kelly);
}

export function calculatePortfolioAnalytics(theses: readonly ThesisDetail[]): PortfolioAnalytics {
  const active = theses.filter((t) => t.status === "active");
  const validVal = active.filter((t) => !hasInvalidValuationInput(t));
  const hyp = tallyHypotheses(active);
  const readinessScores = active.map((t) => calculateResearchReadiness(t).scorePct);
  const margins = validVal.map(
    (t) => calculateImpliedExpectations({ summary: t.valuation }).marginOfSafetyPct,
  );
  const cagrs = validVal.map((t) => t.valuation.base.cagrPct);
  const pos = computePositionMetrics(active);

  return {
    activeCount: active.length,
    archivedCount: theses.length - active.length,
    validatedHypotheses: hyp.validated,
    watchingHypotheses: hyp.watching,
    warningHypotheses: hyp.warning,
    totalHypotheses: active.reduce((sum, item) => sum + item.hypotheses.length, 0),
    averageRiskReward: calculateAverageRiskReward(validVal.map((t) => t.valuation.riskRewardRatio)),
    averageBaseCagrPct: averageFinite(cagrs),
    averageMarginOfSafetyPct: averageFinite(margins),
    averageReadinessPct: Math.round(averageFinite(readinessScores) ?? 0),
    attractiveCount: validVal.filter((t) => t.valuation.convictionZone === "attractive").length,
    balancedCount: validVal.filter((t) => t.valuation.convictionZone === "balanced").length,
    stretchedCount: validVal.filter((t) => t.valuation.convictionZone === "stretched").length,
    ...pos,
  };
}
