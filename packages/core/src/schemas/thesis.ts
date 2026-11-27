import { z } from "zod";
import { HypothesisKpiRuleSchema } from "./v7-research-os";

export const HypothesisStatusSchema = z.enum(["validated", "watching", "warning", "invalidated"]);
export type HypothesisStatus = z.infer<typeof HypothesisStatusSchema>;

export const ConvictionZoneSchema = z.enum(["attractive", "balanced", "stretched"]);
export type ConvictionZone = z.infer<typeof ConvictionZoneSchema>;

export const HypothesisSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  metricLabel: z.string().min(1),
  threshold: z.string().min(1),
  status: HypothesisStatusSchema,
  note: z.string(),
  kpiRule: HypothesisKpiRuleSchema.nullable().optional(),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const MAX_VALUATION_PRICE = 1_000_000;
export const MAX_VALUATION_EPS = 100_000;
export const MAX_VALUATION_PE = 500;

export const ValuationCaseInputSchema = z.object({
  eps: z.number().finite().positive().max(MAX_VALUATION_EPS),
  peMultiple: z.number().finite().positive().max(MAX_VALUATION_PE),
  probability: z.number().finite().min(0).max(1).optional(),
});
export type ValuationCaseInput = z.infer<typeof ValuationCaseInputSchema>;

export const ValuationInputIssueSchema = z.object({
  field: z.enum([
    "currentPrice",
    "horizonYears",
    "bear.eps",
    "bear.peMultiple",
    "base.eps",
    "base.peMultiple",
    "bull.eps",
    "bull.peMultiple",
    "probabilities",
  ]),
  message: z.string().min(1),
});
export type ValuationInputIssue = z.infer<typeof ValuationInputIssueSchema>;

export const ValuationScenarioInputSchema = z.object({
  currentPrice: z.number().finite().positive().max(MAX_VALUATION_PRICE),
  horizonYears: z.number().int().min(1).max(15).default(3),
  bear: ValuationCaseInputSchema,
  base: ValuationCaseInputSchema,
  bull: ValuationCaseInputSchema,
});
export type ValuationScenarioInput = z.input<typeof ValuationScenarioInputSchema>;

export const ValuationCaseResultSchema = z.object({
  eps: z.number(),
  peMultiple: z.number(),
  probability: z.number(),
  targetPrice: z.number(),
  returnPct: z.number(),
  cagrPct: z.number(),
});
export type ValuationCaseResult = z.infer<typeof ValuationCaseResultSchema>;

export const ValuationScenarioSummarySchema = z.object({
  currentPrice: z.number(),
  horizonYears: z.number(),
  bear: ValuationCaseResultSchema,
  base: ValuationCaseResultSchema,
  bull: ValuationCaseResultSchema,
  upsidePct: z.number(),
  bullUpsidePct: z.number(),
  downsidePct: z.number(),
  riskRewardRatio: z.number().nullable(),
  bullRiskRewardRatio: z.number().nullable(),
  isAsymmetricFloor: z.boolean(),
  expectedTargetPrice: z.number(),
  expectedReturnPct: z.number(),
  convictionZone: ConvictionZoneSchema,
});
export type ValuationScenarioSummary = z.infer<typeof ValuationScenarioSummarySchema>;

export const SparklinePointSchema = z.object({
  label: z.string().min(1),
  price: z.number().finite().positive(),
});
export type SparklinePoint = z.infer<typeof SparklinePointSchema>;

export const ThesisCardSchema = z.object({
  id: z.string().min(1),
  indexLabel: z.string().regex(/^\d{2,}$/),
  ticker: z.string().min(1).max(10),
  companyName: z.string().min(1),
  sectorTag: z.string().min(1),
  currentPrice: z.number().finite().positive().max(MAX_VALUATION_PRICE),
  lastReviewedAt: z.string().min(1),
  horizonLabel: z.string().min(1),
  convictionSummary: z.string().min(1),
  hypotheses: z.array(HypothesisSchema).min(3).max(5),
  valuation: ValuationScenarioSummarySchema,
  priceHistory: z.array(SparklinePointSchema).min(2),
});
export type ThesisCard = z.infer<typeof ThesisCardSchema>;
