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
  calmDecisionPct: number;
  entryAlphaRows: DisciplineAlphaRow[];
  favorableDecisionRatePct: number | null;
  avgEntryReturnPct: number | null;
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
  const rows: DisciplineAlphaRow[] = entries.map((entry) => {
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

function scoreCalibration(params: {
  decisionCount: number;
  zeroLevPct: number;
  calmPct: number;
  favorablePct: number | null;
  strengthenedPct: number | null;
}): { score: number; label: string } {
  const base = params.zeroLevPct * 0.3 + params.calmPct * 0.25;
  const score = Math.round(
    Math.min(
      100,
      Math.max(
        20,
        base + (params.favorablePct ?? 60) * 0.25 + (params.strengthenedPct ?? 60) * 0.2,
      ),
    ),
  );
  if (params.decisionCount === 0) return { score: Math.min(72, score), label: "待积累实盘样本" };
  if (score >= 78) return { score, label: "高纪律校准" };
  if (score >= 58) return { score, label: "稳健迭代中" };
  return { score, label: "警惕情绪偏离" };
}

export function calculateCognitiveCalibration(
  thesis: ThesisDetail,
  reviews: readonly QuarterlyReview[],
  livePrice?: number | null,
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
  const { score, label } = scoreCalibration({
    decisionCount: thesis.disciplineEntries.length,
    zeroLevPct: dec.zeroLevPct,
    calmPct: dec.calmPct,
    favorablePct: dec.favorablePct,
    strengthenedPct: strengthenedRatePct,
  });

  return {
    decisionCount: thesis.disciplineEntries.length,
    zeroLeverageCompliancePct: dec.zeroLevPct,
    calmDecisionPct: dec.calmPct,
    entryAlphaRows: dec.rows,
    favorableDecisionRatePct: dec.favorablePct,
    avgEntryReturnPct: dec.avgEntryReturnPct,
    quarterlyVerdictCount: verdicts.length,
    strengthenedRatePct,
    weakenedRatePct,
    calibrationScore: score,
    calibrationLabel: label,
  };
}
