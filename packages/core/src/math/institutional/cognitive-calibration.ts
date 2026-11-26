import type { QuarterlyReview, ThesisDetail, TradeAction } from "../../schemas/research";
import { roundTo } from "../valuation-scenarios";

export interface DisciplineAlphaRow {
  id: string;
  action: TradeAction;
  priceAnchor: number;
  currentPrice: number;
  deltaPct: number;
  favorable: boolean;
  emotion: ThesisDetail["disciplineEntries"][number]["emotion"];
  createdAt: string;
}

export interface CognitiveCalibrationReport {
  decisionCount: number;
  zeroLeverageCompliancePct: number;
  zeroLeverageGatePassed: boolean;
  calmDecisionPct: number;
  entryAlphaRows: DisciplineAlphaRow[];
  favorableDecisionRatePct: number | null;
  avgEntryReturnPct: number | null;
  avgBenchmarkAlphaPct: number | null;
  brierScore: number | null;
  avgTargetDriftPct: number | null;
  quarterlyVerdictCount: number;
  strengthenedRatePct: number | null;
  weakenedRatePct: number | null;
  calibrationScore: number;
  calibrationLabel: string;
}

function isDecisionFavorable(action: TradeAction, deltaPct: number): boolean {
  if (action === "buy" || action === "add" || action === "hold") return deltaPct >= 0;
  return deltaPct <= 0;
}

function ratioPct(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 100);
}

function summarizeDecisions(entries: ThesisDetail["disciplineEntries"], refPrice: number) {
  const rows: DisciplineAlphaRow[] = entries
    .filter((entry) => Number.isFinite(entry.priceAnchor) && entry.priceAnchor > 0)
    .map((entry) => {
      const deltaPct = roundTo(((refPrice - entry.priceAnchor) / entry.priceAnchor) * 100, 1);
      return {
        id: entry.id,
        action: entry.action,
        priceAnchor: entry.priceAnchor,
        currentPrice: refPrice,
        deltaPct,
        favorable: isDecisionFavorable(entry.action, deltaPct),
        emotion: entry.emotion,
        createdAt: entry.createdAt,
      };
    });
  const nonPass = entries.filter((e) => e.action !== "pass");
  const longs = rows.filter((r) => r.action === "buy" || r.action === "add");
  return {
    rows,
    zeroLevPct:
      ratioPct(nonPass.filter((e) => e.noLeverageConfirmed).length, nonPass.length) ?? 100,
    calmPct: ratioPct(entries.filter((e) => e.emotion === "calm").length, entries.length) ?? 100,
    favorablePct: ratioPct(rows.filter((r) => r.favorable).length, rows.length),
    avgEntryReturnPct:
      longs.length === 0
        ? null
        : roundTo(longs.reduce((s, r) => s + r.deltaPct, 0) / longs.length, 1),
  };
}

function computeBenchmarkAlpha(
  entries: ThesisDetail["disciplineEntries"],
  refPrice: number,
  liveBenchmarkPrice?: number | null,
): number | null {
  if (!liveBenchmarkPrice || liveBenchmarkPrice <= 0) return null;
  const benchEntries = entries.filter(
    (e) =>
      (e.action === "buy" || e.action === "add") &&
      e.priceAnchor > 0 &&
      typeof e.benchmarkPrice === "number" &&
      e.benchmarkPrice > 0,
  );
  if (benchEntries.length === 0) return null;
  const sum = benchEntries.reduce((s, e) => {
    const bp = e.benchmarkPrice ?? liveBenchmarkPrice;
    const stockRet = ((refPrice - e.priceAnchor) / e.priceAnchor) * 100;
    const spyRet = ((liveBenchmarkPrice - bp) / bp) * 100;
    return s + (stockRet - spyRet);
  }, 0);
  return roundTo(sum / benchEntries.length, 1);
}

function computeDriftAndAlpha(
  thesis: ThesisDetail,
  reviews: readonly QuarterlyReview[],
  refPrice: number,
  liveBenchmarkPrice?: number | null,
) {
  const validReviews = reviews.filter(
    (r) => Number.isFinite(r.baseTargetAtReview) && r.baseTargetAtReview > 0,
  );
  const avgTargetDriftPct =
    validReviews.length > 0
      ? roundTo(
          validReviews.reduce(
            (s, r) => s + ((refPrice - r.baseTargetAtReview) / r.baseTargetAtReview) * 100,
            0,
          ) / validReviews.length,
          1,
        )
      : null;
  return {
    brierScore: null,
    avgTargetDriftPct,
    avgBenchmarkAlphaPct: computeBenchmarkAlpha(
      thesis.disciplineEntries,
      refPrice,
      liveBenchmarkPrice,
    ),
  };
}

function scoreCalibration(params: {
  decisionCount: number;
  zeroLevGate: boolean;
  calmPct: number;
  favorablePct: number | null;
  strengthenedPct: number | null;
}): { score: number; label: string } {
  if (params.decisionCount === 0) return { score: 0, label: "待积累实盘样本" };
  const raw =
    params.calmPct * 0.375 +
    (params.favorablePct ?? 50) * 0.4375 +
    (params.strengthenedPct ?? 50) * 0.1875;
  const gated = params.zeroLevGate ? raw : raw * 0.5;
  const score = Math.round(Math.min(100, Math.max(10, gated)));
  if (score >= 76) return { score, label: "高纪律校准" };
  if (score >= 55) return { score, label: "稳健迭代中" };
  return { score, label: "警惕情绪偏离" };
}

export function calculateCognitiveCalibration(
  thesis: ThesisDetail,
  reviews: readonly QuarterlyReview[],
  livePrice?: number | null,
  liveBenchmarkPrice?: number | null,
): CognitiveCalibrationReport {
  const refPrice = livePrice && livePrice > 0 ? livePrice : thesis.currentPrice;
  const dec = summarizeDecisions(thesis.disciplineEntries, refPrice);
  const verdicts = reviews.flatMap((r) => r.hypothesisVerdicts);
  const strengthenedRatePct = ratioPct(
    verdicts.filter((v) => v.verdict === "strengthened").length,
    verdicts.length,
  );
  const weakenedRatePct = ratioPct(
    verdicts.filter((v) => v.verdict === "weakened").length,
    verdicts.length,
  );
  const extra = computeDriftAndAlpha(thesis, reviews, refPrice, liveBenchmarkPrice);
  const zeroLeverageGatePassed = dec.zeroLevPct === 100;
  const { score, label } = scoreCalibration({
    decisionCount: thesis.disciplineEntries.length,
    zeroLevGate: zeroLeverageGatePassed,
    calmPct: dec.calmPct,
    favorablePct: dec.favorablePct,
    strengthenedPct: strengthenedRatePct,
  });

  return {
    decisionCount: thesis.disciplineEntries.length,
    zeroLeverageCompliancePct: dec.zeroLevPct,
    zeroLeverageGatePassed,
    calmDecisionPct: dec.calmPct,
    entryAlphaRows: dec.rows,
    favorableDecisionRatePct: dec.favorablePct,
    avgEntryReturnPct: dec.avgEntryReturnPct,
    avgBenchmarkAlphaPct: extra.avgBenchmarkAlphaPct,
    brierScore: null,
    avgTargetDriftPct: extra.avgTargetDriftPct,
    quarterlyVerdictCount: verdicts.length,
    strengthenedRatePct,
    weakenedRatePct,
    calibrationScore: score,
    calibrationLabel: label,
  };
}
