import type {
  EmotionState,
  PortfolioRole,
  QuarterlyReview,
  ThesisDetail,
} from "../../schemas/research";
import { suggestKellyCappedWeight } from "../portfolio-analytics";
import {
  calculateValuationScenarios,
  hasInvalidValuationInput,
  roundTo,
  sanitizeValuationInput,
} from "../valuation-scenarios";
import { calculateCognitiveCalibration, type DisciplineAlphaRow } from "./cognitive-calibration";

const EMOTION_LABELS: Record<EmotionState, string> = {
  calm: "冷静执行",
  hesitant: "犹豫观望",
  fomo: "FOMO 追高",
  fearful: "恐慌割肉",
};
const EMOTION_ORDER: readonly EmotionState[] = ["calm", "hesitant", "fomo", "fearful"];

export interface EmotionAttributionRow {
  emotion: EmotionState;
  label: string;
  entryCount: number;
  favorableCount: number;
  winRatePct: number | null;
  avgDeltaPct: number | null;
}

export interface VerdictTrackSummary {
  totalVerdicts: number;
  strengthenedCount: number;
  unchangedCount: number;
  weakenedCount: number;
  strengthenedPct: number | null;
  weakenedPct: number | null;
}

export interface PositionEfficiencyRow {
  thesisId: string;
  ticker: string;
  companyName: string;
  portfolioRole: PortfolioRole;
  currentWeightPct: number;
  targetMaxWeightPct: number;
  kellyCappedWeightPct: number;
  avgCostBasis: number | null;
  refPrice: number;
  unrealisedReturnPct: number | null;
  calibrationScore: number;
}

export interface PortfolioCalibrationReport {
  totalTheses: number;
  activePositionCount: number;
  totalActiveWeightPct: number;
  weightedCalibrationScore: number;
  totalDecisionCount: number;
  zeroLeverageCompliancePct: number;
  calmSharePct: number;
  overallWinRatePct: number | null;
  emotionBreakdown: EmotionAttributionRow[];
  verdictSummary: VerdictTrackSummary;
  positionRows: PositionEfficiencyRow[];
}

function directionalDeltaPct(row: DisciplineAlphaRow): number {
  return row.action === "trim" || row.action === "pass" ? -row.deltaPct : row.deltaPct;
}

function aggregateEmotions(rows: readonly DisciplineAlphaRow[]): EmotionAttributionRow[] {
  return EMOTION_ORDER.map((emotion) => {
    const subset = rows.filter((r) => r.emotion === emotion);
    const fav = subset.filter((r) => r.favorable).length;
    const avgDelta =
      subset.length === 0
        ? null
        : roundTo(subset.reduce((s, r) => s + directionalDeltaPct(r), 0) / subset.length, 1);
    return {
      emotion,
      label: EMOTION_LABELS[emotion],
      entryCount: subset.length,
      favorableCount: fav,
      winRatePct: subset.length === 0 ? null : Math.round((fav / subset.length) * 100),
      avgDeltaPct: avgDelta,
    };
  });
}

function aggregateVerdicts(reviews: readonly QuarterlyReview[]): VerdictTrackSummary {
  const verdicts = reviews.flatMap((r) => r.hypothesisVerdicts);
  const total = verdicts.length;
  const strengthened = verdicts.filter((v) => v.verdict === "strengthened").length;
  const weakened = verdicts.filter((v) => v.verdict === "weakened").length;
  const unchanged = total - strengthened - weakened;
  return {
    totalVerdicts: total,
    strengthenedCount: strengthened,
    unchangedCount: unchanged,
    weakenedCount: weakened,
    strengthenedPct: total === 0 ? null : Math.round((strengthened / total) * 100),
    weakenedPct: total === 0 ? null : Math.round((weakened / total) * 100),
  };
}

function buildPositionRow(
  thesis: ThesisDetail,
  calibrationScore: number,
  livePrice?: number,
): PositionEfficiencyRow {
  const refPrice = livePrice && livePrice > 0 ? livePrice : thesis.currentPrice;
  const cost = thesis.avgCostBasis;
  const unrealised =
    cost !== null && cost > 0 ? roundTo(((refPrice - cost) / cost) * 100, 1) : null;
  const checked = sanitizeValuationInput({ ...thesis.valuationInput, currentPrice: refPrice });
  const incomplete = hasInvalidValuationInput(thesis) || !checked.ok;
  const activeVal =
    !incomplete && checked.ok && Math.abs(refPrice - thesis.currentPrice) > 0.001
      ? calculateValuationScenarios(checked.input)
      : thesis.valuation;
  const kelly = incomplete
    ? { minPct: 0, maxPct: 0, rationale: "估值输入待完善" }
    : suggestKellyCappedWeight({
        ...thesis,
        currentPrice: refPrice,
        valuation: activeVal,
      });
  return {
    thesisId: thesis.id,
    ticker: thesis.ticker,
    companyName: thesis.companyName,
    portfolioRole: thesis.portfolioRole,
    currentWeightPct: thesis.currentWeightPct,
    targetMaxWeightPct: thesis.targetMaxWeightPct,
    kellyCappedWeightPct: kelly.maxPct,
    avgCostBasis: cost,
    refPrice,
    unrealisedReturnPct: unrealised,
    calibrationScore,
  };
}

function collectThesisMetrics(
  theses: readonly ThesisDetail[],
  reviewsByThesis: ReadonlyMap<string, readonly QuarterlyReview[]>,
  livePrices?: Readonly<Record<string, number>>,
) {
  const allRows: DisciplineAlphaRow[] = [];
  const allReviews: QuarterlyReview[] = [];
  const positionRows: PositionEfficiencyRow[] = [];
  let weightedScoreSum = 0;
  let scoredWeight = 0;
  let totalWeight = 0;
  let scoreSum = 0;
  let scoredCount = 0;
  for (const thesis of theses) {
    const reviews = reviewsByThesis.get(thesis.id) ?? [];
    allReviews.push(...reviews);
    const live = livePrices?.[thesis.ticker];
    const report = calculateCognitiveCalibration(thesis, reviews, live);
    allRows.push(...report.entryAlphaRows);
    const hasSample = report.decisionCount > 0;
    if (hasSample) {
      scoreSum += report.calibrationScore;
      scoredCount += 1;
    }
    if (thesis.currentWeightPct > 0) {
      totalWeight += thesis.currentWeightPct;
      if (hasSample) {
        weightedScoreSum += report.calibrationScore * thesis.currentWeightPct;
        scoredWeight += thesis.currentWeightPct;
      }
    }
    if (thesis.portfolioRole !== "watchlist" || thesis.currentWeightPct > 0) {
      positionRows.push(buildPositionRow(thesis, report.calibrationScore, live));
    }
  }
  return {
    allRows,
    allReviews,
    positionRows,
    weightedScoreSum,
    scoredWeight,
    totalWeight,
    scoreSum,
    scoredCount,
  };
}

export function calculatePortfolioCalibration(
  theses: readonly ThesisDetail[],
  reviewsByThesis: ReadonlyMap<string, readonly QuarterlyReview[]>,
  livePrices?: Readonly<Record<string, number>>,
): PortfolioCalibrationReport {
  const active = theses.filter((t) => t.status !== "archived_veto");
  const m = collectThesisMetrics(active, reviewsByThesis, livePrices);
  const allEntries = active.flatMap((t) => t.disciplineEntries);
  const nonPass = allEntries.filter((e) => e.action !== "pass");
  const zeroLevPct =
    nonPass.length === 0
      ? 100
      : Math.round((nonPass.filter((e) => e.noLeverageConfirmed).length / nonPass.length) * 100);
  const calmCount = allEntries.filter((e) => e.emotion === "calm").length;
  const favCount = m.allRows.filter((r) => r.favorable).length;
  const avgScore = m.scoredCount === 0 ? 0 : Math.round(m.scoreSum / m.scoredCount);

  return {
    totalTheses: active.length,
    activePositionCount: m.positionRows.length,
    totalActiveWeightPct: roundTo(m.totalWeight, 1),
    weightedCalibrationScore:
      m.scoredWeight > 0 ? Math.round(m.weightedScoreSum / m.scoredWeight) : avgScore,
    totalDecisionCount: allEntries.length,
    zeroLeverageCompliancePct: zeroLevPct,
    calmSharePct: allEntries.length === 0 ? 100 : Math.round((calmCount / allEntries.length) * 100),
    overallWinRatePct:
      m.allRows.length === 0 ? null : Math.round((favCount / m.allRows.length) * 100),
    emotionBreakdown: aggregateEmotions(m.allRows),
    verdictSummary: aggregateVerdicts(m.allReviews),
    positionRows: m.positionRows.sort((a, b) => b.currentWeightPct - a.currentWeightPct),
  };
}
