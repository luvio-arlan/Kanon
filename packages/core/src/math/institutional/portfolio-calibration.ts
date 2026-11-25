import type {
  EmotionState,
  PortfolioRole,
  QuarterlyReview,
  ThesisDetail,
} from "../../schemas/research";
import { suggestKellyCappedWeight } from "../portfolio-analytics";
import { roundTo } from "../valuation-scenarios";
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

function aggregateEmotions(rows: readonly DisciplineAlphaRow[]): EmotionAttributionRow[] {
  return EMOTION_ORDER.map((emotion) => {
    const subset = rows.filter((r) => r.emotion === emotion);
    const fav = subset.filter((r) => r.favorable).length;
    const avgDelta =
      subset.length === 0
        ? null
        : roundTo(subset.reduce((s, r) => s + r.deltaPct, 0) / subset.length, 1);
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
  const kelly = suggestKellyCappedWeight(thesis);
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
  let totalWeight = 0;
  let scoreSum = 0;
  for (const thesis of theses) {
    const reviews = reviewsByThesis.get(thesis.id) ?? [];
    allReviews.push(...reviews);
    const live = livePrices?.[thesis.ticker];
    const report = calculateCognitiveCalibration(thesis, reviews, live);
    allRows.push(...report.entryAlphaRows);
    scoreSum += report.calibrationScore;
    if (thesis.currentWeightPct > 0) {
      weightedScoreSum += report.calibrationScore * thesis.currentWeightPct;
      totalWeight += thesis.currentWeightPct;
    }
    if (thesis.portfolioRole !== "watchlist" || thesis.currentWeightPct > 0) {
      positionRows.push(buildPositionRow(thesis, report.calibrationScore, live));
    }
  }
  return { allRows, allReviews, positionRows, weightedScoreSum, totalWeight, scoreSum };
}

export function calculatePortfolioCalibration(
  theses: readonly ThesisDetail[],
  reviewsByThesis: ReadonlyMap<string, readonly QuarterlyReview[]>,
  livePrices?: Readonly<Record<string, number>>,
): PortfolioCalibrationReport {
  const m = collectThesisMetrics(theses, reviewsByThesis, livePrices);
  const allEntries = theses.flatMap((t) => t.disciplineEntries);
  const nonPass = allEntries.filter((e) => e.action !== "pass");
  const zeroLevPct =
    nonPass.length === 0
      ? 100
      : Math.round((nonPass.filter((e) => e.noLeverageConfirmed).length / nonPass.length) * 100);
  const calmCount = allEntries.filter((e) => e.emotion === "calm").length;
  const favCount = m.allRows.filter((r) => r.favorable).length;
  const avgScore = theses.length === 0 ? 70 : Math.round(m.scoreSum / theses.length);

  return {
    totalTheses: theses.length,
    activePositionCount: m.positionRows.length,
    totalActiveWeightPct: roundTo(m.totalWeight, 1),
    weightedCalibrationScore:
      m.totalWeight > 0 ? Math.round(m.weightedScoreSum / m.totalWeight) : avgScore,
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
