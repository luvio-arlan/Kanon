import { z } from "zod";
import { EmotionStateSchema, PortfolioRoleSchema } from "../schemas/research";

export const EmotionAttributionRowSchema = z.object({
  emotion: EmotionStateSchema,
  label: z.string(),
  entryCount: z.number().int().nonnegative(),
  favorableCount: z.number().int().nonnegative(),
  winRatePct: z.number().nullable(),
  avgDeltaPct: z.number().nullable(),
});

export const VerdictTrackSummarySchema = z.object({
  totalVerdicts: z.number().int().nonnegative(),
  strengthenedCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
  weakenedCount: z.number().int().nonnegative(),
  strengthenedPct: z.number().nullable(),
  weakenedPct: z.number().nullable(),
});

export const PositionEfficiencyRowSchema = z.object({
  thesisId: z.string(),
  ticker: z.string(),
  companyName: z.string(),
  portfolioRole: PortfolioRoleSchema,
  currentWeightPct: z.number(),
  targetMaxWeightPct: z.number(),
  kellyCappedWeightPct: z.number(),
  avgCostBasis: z.number().nullable(),
  refPrice: z.number(),
  unrealisedReturnPct: z.number().nullable(),
  calibrationScore: z.number(),
});

export const PortfolioCalibrationReportSchema = z.object({
  totalTheses: z.number().int().nonnegative(),
  activePositionCount: z.number().int().nonnegative(),
  totalActiveWeightPct: z.number(),
  weightedCalibrationScore: z.number(),
  totalDecisionCount: z.number().int().nonnegative(),
  zeroLeverageCompliancePct: z.number(),
  calmSharePct: z.number(),
  overallWinRatePct: z.number().nullable(),
  emotionBreakdown: z.array(EmotionAttributionRowSchema),
  verdictSummary: VerdictTrackSummarySchema,
  positionRows: z.array(PositionEfficiencyRowSchema),
});

export const WeeklyIcDigestSchema = z.object({
  generatedAt: z.string(),
  activeCount: z.number().int().nonnegative(),
  weightedCalibrationScore: z.number(),
  upcomingCatalysts: z.array(
    z.object({
      ticker: z.string(),
      companyName: z.string(),
      title: z.string(),
      dateLabel: z.string(),
      impact: z.string(),
    }),
  ),
  warningHypotheses: z.array(
    z.object({
      ticker: z.string(),
      companyName: z.string(),
      title: z.string(),
      threshold: z.string(),
    }),
  ),
  divergentCrossChecks: z.array(
    z.object({
      ticker: z.string(),
      companyName: z.string(),
      title: z.string(),
      threshold: z.string(),
    }),
  ),
  attentionTheses: z.array(
    z.object({
      ticker: z.string(),
      companyName: z.string(),
      level: z.enum(["urgent", "attention", "healthy"]),
      reason: z.string(),
    }),
  ),
  summaryLine: z.string(),
});

export const PortfolioCalibrationResponseSchema = z.object({
  calibration: PortfolioCalibrationReportSchema,
  digest: WeeklyIcDigestSchema,
});
