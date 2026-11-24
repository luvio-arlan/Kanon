import {
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type ThesisDetail,
} from "@kanon/core";

export type ComparisonSortKey = "odds" | "cagr" | "margin" | "downside" | "readiness";
export type ComparisonSortDir = "desc" | "asc";

export const COMPARISON_SORT_COLS: ReadonlyArray<{ key: ComparisonSortKey; label: string }> = [
  { key: "cagr", label: "年化 CAGR" },
  { key: "margin", label: "安全边际" },
  { key: "downside", label: "悲观回撤" },
  { key: "odds", label: "赔率比" },
  { key: "readiness", label: "成熟度" },
];

export function getComparisonSortMetric(thesis: ThesisDetail, key: ComparisonSortKey): number {
  if (key === "odds") return thesis.valuation.riskRewardRatio ?? 99;
  if (key === "cagr") return thesis.valuation.base.cagrPct;
  if (key === "margin") {
    return calculateImpliedExpectations({ summary: thesis.valuation }).marginOfSafetyPct;
  }
  if (key === "downside") return -thesis.valuation.downsidePct;
  return calculateResearchReadiness(thesis).scorePct;
}
