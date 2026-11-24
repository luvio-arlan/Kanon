import type { ThesisDetail } from "../schemas/research";
import { calculateImpliedExpectations } from "./implied-expectations";
import { calculateResearchReadiness } from "./research-readiness";
import { calculateAverageRiskReward, roundTo } from "./valuation-scenarios";

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

export function calculatePortfolioAnalytics(theses: readonly ThesisDetail[]): PortfolioAnalytics {
  const active = theses.filter((t) => t.status === "active");
  const hyp = tallyHypotheses(active);
  const readinessScores = active.map((t) => calculateResearchReadiness(t).scorePct);
  const margins = active.map(
    (t) => calculateImpliedExpectations({ summary: t.valuation }).marginOfSafetyPct,
  );
  const cagrs = active.map((t) => t.valuation.base.cagrPct);

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
  };
}
