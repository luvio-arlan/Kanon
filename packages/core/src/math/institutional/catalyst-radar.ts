import type { ThesisDetail } from "../../schemas/research";

export type ReviewRadarLevel = "urgent_review" | "catalyst_imminent" | "healthy";

export interface ThesisReviewRadarItem {
  thesisId: string;
  ticker: string;
  companyName: string;
  level: ReviewRadarLevel;
  daysSinceUpdate: number;
  warningHypothesesCount: number;
  upcomingHighCatalystsCount: number;
  reason: string;
  targetStep: 2 | 5;
}

export interface PortfolioReviewRadarReport {
  staleCount: number;
  warningCount: number;
  upcomingHighImpactCount: number;
  items: ThesisReviewRadarItem[];
}

function parseYmdSortKey(clean: string): number | null {
  const ymd = /(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/.exec(clean);
  if (!ymd?.[1] || !ymd[2]) return null;
  const year = Number(ymd[1]);
  const month = Math.min(12, Math.max(1, Number(ymd[2])));
  const day = ymd[3] ? Math.min(31, Math.max(1, Number(ymd[3]))) : 15;
  return year * 10000 + month * 100 + day;
}

function parseQuarterSortKey(clean: string): number | null {
  const yq = /(20\d{2})\s*[-/]?\s*Q([1-4])/.exec(clean) ?? /Q([1-4])\s*(20\d{2})/.exec(clean);
  if (yq?.[1] && yq[2]) {
    const isYearFirst = yq[1].length === 4;
    const year = Number(isYearFirst ? yq[1] : yq[2]);
    const quarter = Number(isYearFirst ? yq[2] : yq[1]);
    return year * 10000 + quarter * 300 + 15;
  }
  const fyq = /FY(\d{2})\s*Q([1-4])/.exec(clean);
  if (!fyq?.[1] || !fyq[2]) return null;
  return (2000 + Number(fyq[1])) * 10000 + Number(fyq[2]) * 300 + 15;
}

export function parseCatalystSortKey(dateLabel: string): number {
  const clean = dateLabel.trim().toUpperCase();
  return parseYmdSortKey(clean) ?? parseQuarterSortKey(clean) ?? 99991231;
}

function resolveRadarDecision(
  daysSinceUpdate: number,
  warningHypothesesCount: number,
  upcomingHighCatalystsCount: number,
  staleThresholdDays: number,
): { level: ReviewRadarLevel; reason: string; targetStep: 2 | 5 } {
  if (warningHypothesesCount > 0) {
    return {
      level: "urgent_review",
      reason: `存在 ${warningHypothesesCount} 条预警假设，建议立即进入季度复盘核验`,
      targetStep: 5,
    };
  }
  if (daysSinceUpdate >= staleThresholdDays) {
    return {
      level: "urgent_review",
      reason: `距上次修订已过 ${daysSinceUpdate} 天，建议同步最新季报并复盘`,
      targetStep: 5,
    };
  }
  if (upcomingHighCatalystsCount > 0) {
    return {
      level: "catalyst_imminent",
      reason: `待验证 ${upcomingHighCatalystsCount} 项高影响催化，提前核对验证指标`,
      targetStep: 2,
    };
  }
  return { level: "healthy", reason: "档案新鲜度与核心假设状态正常", targetStep: 5 };
}

function classifyRadarItem(
  thesis: ThesisDetail,
  nowMs: number,
  staleThresholdDays: number,
): ThesisReviewRadarItem {
  const updatedMs = Date.parse(thesis.updatedAt);
  const daysSinceUpdate = Number.isFinite(updatedMs)
    ? Math.max(0, Math.floor((nowMs - updatedMs) / (24 * 60 * 60 * 1000)))
    : 0;
  const warningHypothesesCount = thesis.hypotheses.filter((h) => h.status === "warning").length;
  const upcomingHighCatalystsCount = thesis.catalysts.filter(
    (c) => c.status === "upcoming" && c.impact === "high",
  ).length;
  const decision = resolveRadarDecision(
    daysSinceUpdate,
    warningHypothesesCount,
    upcomingHighCatalystsCount,
    staleThresholdDays,
  );
  return {
    thesisId: thesis.id,
    ticker: thesis.ticker,
    companyName: thesis.companyName,
    daysSinceUpdate,
    warningHypothesesCount,
    upcomingHighCatalystsCount,
    ...decision,
  };
}

const LEVEL_RANK: Record<ReviewRadarLevel, number> = {
  urgent_review: 0,
  catalyst_imminent: 1,
  healthy: 2,
};

export function evaluatePortfolioReviewRadar(
  theses: readonly ThesisDetail[],
  nowIso?: string,
  staleThresholdDays = 30,
): PortfolioReviewRadarReport {
  const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
  const active = theses.filter((t) => t.status === "active");
  const items = active
    .map((t) => classifyRadarItem(t, nowMs, staleThresholdDays))
    .sort(
      (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.daysSinceUpdate - a.daysSinceUpdate,
    );

  return {
    staleCount: items.filter((i) => i.daysSinceUpdate >= staleThresholdDays).length,
    warningCount: items.filter((i) => i.warningHypothesesCount > 0).length,
    upcomingHighImpactCount: items.reduce((sum, i) => sum + i.upcomingHighCatalystsCount, 0),
    items,
  };
}
