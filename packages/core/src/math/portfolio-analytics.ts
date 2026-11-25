import type { ThesisDetail } from "../schemas/research";
import { calculateImpliedExpectations } from "./implied-expectations";
import { calculateResearchReadiness } from "./research-readiness";
import { calculateAverageRiskReward, roundTo } from "./valuation-scenarios";

export interface SectorExposure {
  sector: string;
  weightPct: number;
  count: number;
  overConcentrated: boolean;
}

export interface KellyWeightSuggestion {
  minPct: number;
  maxPct: number;
  rationale: string;
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
      weightPct: roundTo(curr.weightPct + item.currentWeightPct, 1),
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
            (sum, item) => sum + item.currentWeightPct * item.valuation.base.cagrPct,
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

export function suggestKellyCappedWeight(thesis: ThesisDetail): KellyWeightSuggestion {
  const cap = Math.max(1, Math.min(25, thesis.targetMaxWeightPct));
  if (thesis.status === "archived_veto" || thesis.valuation.upsidePct <= 0) {
    return { minPct: 0, maxPct: 0, rationale: "当前已否决或中性空间不足，建议保持 0% 观察。" };
  }
  const odds = thesis.valuation.riskRewardRatio ?? 4;
  const readiness = calculateResearchReadiness(thesis).scorePct;
  const hasWarning = thesis.hypotheses.some((h) => h.status === "warning");
  const scenarioWinProb = thesis.valuation.base.probability + thesis.valuation.bull.probability;
  const confidenceScale = 0.72 + (readiness / 100) * 0.28;
  const pWin = Math.min(0.8, Math.max(0.25, scenarioWinProb * confidenceScale));
  const rawKelly = pWin - (1 - pWin) / Math.max(0.5, odds);
  if (rawKelly <= 0) {
    return { minPct: 0, maxPct: 0, rationale: "当前赔率与胜率未达正凯利期望，建议 0% 观察。" };
  }
  const rawHalfPct = Math.max(0, roundTo(rawKelly * 50, 0));
  const adjustedHalfPct = hasWarning ? Math.floor(rawHalfPct * 0.5) : rawHalfPct;
  const boundedMax = Math.min(cap, Math.max(0, adjustedHalfPct));
  if (boundedMax < 2) {
    return {
      minPct: 0,
      maxPct: Math.min(cap, Math.max(1, boundedMax)),
      rationale: "当前赔率或预警折扣后仓位偏低，仅宜观察或极小试探仓。",
    };
  }
  const minPct = Math.max(2, Math.floor(boundedMax * 0.55));
  const warnSuffix = hasWarning ? "（存在预警假设已自动折半）" : "（半凯利且受个人上限约束）";
  return {
    minPct: Math.min(minPct, boundedMax),
    maxPct: boundedMax,
    rationale: `基于赔率 ${odds.toFixed(2)}×、情景胜率 ${Math.round(scenarioWinProb * 100)}% 与成熟度 ${readiness}% 测算${warnSuffix}`,
  };
}

export function calculatePortfolioAnalytics(theses: readonly ThesisDetail[]): PortfolioAnalytics {
  const active = theses.filter((t) => t.status === "active");
  const hyp = tallyHypotheses(active);
  const readinessScores = active.map((t) => calculateResearchReadiness(t).scorePct);
  const margins = active.map(
    (t) => calculateImpliedExpectations({ summary: t.valuation }).marginOfSafetyPct,
  );
  const cagrs = active.map((t) => t.valuation.base.cagrPct);
  const pos = computePositionMetrics(active);

  return {
    activeCount: active.length,
    archivedCount: theses.length - active.length,
    validatedHypotheses: hyp.validated,
    watchingHypotheses: hyp.watching,
    warningHypotheses: hyp.warning,
    totalHypotheses: active.reduce((sum, item) => sum + item.hypotheses.length, 0),
    averageRiskReward: calculateAverageRiskReward(active.map((t) => t.valuation.riskRewardRatio)),
    averageBaseCagrPct: averageFinite(cagrs),
    averageMarginOfSafetyPct: averageFinite(margins),
    averageReadinessPct: Math.round(averageFinite(readinessScores) ?? 0),
    attractiveCount: active.filter((t) => t.valuation.convictionZone === "attractive").length,
    balancedCount: active.filter((t) => t.valuation.convictionZone === "balanced").length,
    stretchedCount: active.filter((t) => t.valuation.convictionZone === "stretched").length,
    ...pos,
  };
}
