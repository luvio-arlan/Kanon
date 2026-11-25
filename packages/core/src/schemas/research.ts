import { z } from "zod";
import {
  HypothesisSchema,
  MAX_VALUATION_EPS,
  MAX_VALUATION_PRICE,
  SparklinePointSchema,
  ThesisCardSchema,
  ValuationScenarioInputSchema,
} from "./thesis";
import {
  PortfolioRoleSchema,
  RevisionSnapshotSchema,
  ValuationDriverInputsSchema,
  ValuationModelModeSchema,
} from "./v4-extensions";
import { ThesisCatalystSchema } from "./v5-institutional";

export * from "./v4-extensions";
export * from "./v5-institutional";
export * from "./v7-research-os";

export const FilterVerdictSchema = z.enum(["pass", "watch", "veto"]);
export type FilterVerdict = z.infer<typeof FilterVerdictSchema>;

export const ThesisStatusSchema = z.enum(["active", "archived_veto"]);
export type ThesisStatus = z.infer<typeof ThesisStatusSchema>;

export const BusinessFilterSchema = z.object({
  recurringRevenue: FilterVerdictSchema,
  pricingPower: FilterVerdictSchema,
  capitalReturn: FilterVerdictSchema,
  governance: FilterVerdictSchema,
  notes: z.string(),
  vetoReason: z.string(),
  consensusView: z.string().default(""),
  variantPerception: z.string().default(""),
  keyDebate: z.string().default(""),
  preMortem: z.string().default(""),
});
export type BusinessFilter = z.infer<typeof BusinessFilterSchema>;

export const ThesisSummarySchema = z.object({
  id: z.string().min(1),
  indexLabel: z.string().regex(/^\d{2,}$/),
  ticker: z.string().min(1),
  companyName: z.string().min(1),
  sectorTag: z.string().min(1),
  status: ThesisStatusSchema,
  baseTargetPrice: z.number(),
  riskRewardRatio: z.number().nullable(),
});
export type ThesisSummary = z.infer<typeof ThesisSummarySchema>;

export const PeerRoleSchema = z.enum(["upstream", "downstream", "competitor", "primary"]);
export type PeerRole = z.infer<typeof PeerRoleSchema>;

export const AlignmentSchema = z.enum(["aligned", "divergent", "pending"]);
export type Alignment = z.infer<typeof AlignmentSchema>;

export const CrossCheckSchema = z.object({
  id: z.string().min(1),
  peerCompany: z.string().min(1),
  peerRole: PeerRoleSchema,
  topic: z.string().min(1),
  sourceAnchor: z.string().min(1),
  statement: z.string().min(1),
  alignment: AlignmentSchema,
  takeaway: z.string().min(1),
  linkedThesisId: z.string().min(1).nullable().optional(),
  hypothesisId: z.string().min(1).nullable().optional(),
});
export type CrossCheck = z.infer<typeof CrossCheckSchema>;

export const TradeActionSchema = z.enum(["buy", "add", "trim", "hold", "pass"]);
export type TradeAction = z.infer<typeof TradeActionSchema>;

export const EmotionStateSchema = z.enum(["calm", "hesitant", "fomo", "fearful"]);
export type EmotionState = z.infer<typeof EmotionStateSchema>;

export const DisciplineEntrySchema = z.object({
  id: z.string().min(1),
  action: TradeActionSchema,
  noLeverageConfirmed: z.boolean(),
  positionCapConfirmed: z.boolean(),
  exitRule: z.string().min(1),
  emotion: EmotionStateSchema,
  priceAnchor: z.number().finite().positive(),
  weightDeltaPct: z.number().finite().min(-100).max(100).nullable().optional(),
  benchmarkPrice: z.number().finite().positive().nullable().optional(),
  note: z.string(),
  createdAt: z.string().min(1),
});
export type DisciplineEntry = z.infer<typeof DisciplineEntrySchema>;

export const CreateDisciplineEntrySchema = DisciplineEntrySchema.omit({
  id: true,
  createdAt: true,
})
  .extend({
    syncPosition: z.boolean().optional(),
  })
  .refine((entry) => entry.action === "pass" || entry.noLeverageConfirmed, {
    message: "风控约束：建仓、加仓或持有操作必须明确确认「零杠杆」原则。",
    path: ["noLeverageConfirmed"],
  });
export type CreateDisciplineEntryInput = z.infer<typeof CreateDisciplineEntrySchema>;

export const GlossaryTermSchema = z.object({
  term: z.string().min(1),
  fullName: z.string().min(1),
  category: z.string().min(1),
  plainSummary: z.string().min(1),
  filingContext: z.string().min(1),
  example: z.string().min(1),
});
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;

export const SavedCopilotOutputSchema = z.object({
  action: z.enum(["earnings_digest", "red_team", "investment_memo"]),
  engine: z.enum(["vercel-ai-sdk", "grounded-local"]),
  payload: z.unknown(),
  updatedAt: z.string().min(1),
});
export type SavedCopilotOutput = z.infer<typeof SavedCopilotOutputSchema>;

export const CreateThesisInputSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((v) => v.toUpperCase()),
  companyName: z.string().trim().min(1).max(60),
  sectorTag: z.string().trim().min(1).max(40),
  currentPrice: z.number().finite().positive().max(MAX_VALUATION_PRICE),
  convictionSummary: z.string().trim().min(1).max(280).optional(),
  latestSecEps: z.number().finite().positive().max(MAX_VALUATION_EPS).optional(),
  priceHistory: z.array(SparklinePointSchema).min(2).max(12).optional(),
});
export type CreateThesisInput = z.input<typeof CreateThesisInputSchema>;

export const RevisionStepSchema = z.enum([
  "create",
  "business_filter",
  "hypotheses",
  "catalysts",
  "cross_checks",
  "valuation",
  "price_anchor",
  "discipline",
  "portfolio",
  "quarterly_review",
]);
export type RevisionStep = z.infer<typeof RevisionStepSchema>;

export const ThesisRevisionSchema = z.object({
  id: z.string().min(1),
  thesisId: z.string().min(1),
  step: RevisionStepSchema,
  summary: z.string().min(1),
  currentPrice: z.number().finite().positive(),
  baseTargetPrice: z.number().finite().positive(),
  riskRewardRatio: z.number().nullable(),
  readinessScore: z.number().int().min(0).max(100),
  snapshot: RevisionSnapshotSchema.nullable().optional(),
  createdAt: z.string().min(1),
});
export type ThesisRevision = z.infer<typeof ThesisRevisionSchema>;

export const UpdateThesisStepSchema = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("business_filter"),
    status: ThesisStatusSchema,
    convictionSummary: z.string().trim().min(1),
    businessFilter: BusinessFilterSchema,
  }),
  z.object({ step: z.literal("hypotheses"), hypotheses: z.array(HypothesisSchema).min(3).max(5) }),
  z.object({ step: z.literal("catalysts"), catalysts: z.array(ThesisCatalystSchema).max(12) }),
  z.object({ step: z.literal("cross_checks"), crossChecks: z.array(CrossCheckSchema).max(12) }),
  z.object({
    step: z.literal("valuation"),
    valuationInput: ValuationScenarioInputSchema,
    modelMode: ValuationModelModeSchema.optional(),
    driverInputs: ValuationDriverInputsSchema.nullable().optional(),
    priceHistory: z.array(SparklinePointSchema).min(2).optional(),
  }),
  z.object({
    step: z.literal("price_anchor"),
    currentPrice: z.number().finite().positive().max(MAX_VALUATION_PRICE),
    label: z.string().trim().min(1).max(20).optional(),
  }),
  z.object({
    step: z.literal("portfolio"),
    portfolioRole: PortfolioRoleSchema,
    currentWeightPct: z.number().finite().min(0).max(100),
    targetMaxWeightPct: z.number().finite().min(1).max(100),
    avgCostBasis: z.number().finite().positive().nullable(),
  }),
]);
export type UpdateThesisStepInput = z.infer<typeof UpdateThesisStepSchema>;

export const ThesisDetailSchema = ThesisCardSchema.extend({
  status: ThesisStatusSchema,
  horizonYears: z.number().int().positive(),
  portfolioRole: PortfolioRoleSchema.default("watchlist"),
  currentWeightPct: z.number().min(0).max(100).default(0),
  targetMaxWeightPct: z.number().min(1).max(100).default(15),
  avgCostBasis: z.number().positive().nullable().default(null),
  businessFilter: BusinessFilterSchema,
  catalysts: z.array(ThesisCatalystSchema).default([]),
  crossChecks: z.array(CrossCheckSchema),
  valuationInput: ValuationScenarioInputSchema,
  valuationModelMode: ValuationModelModeSchema.default("pe"),
  valuationDriverInputs: ValuationDriverInputsSchema.nullable().default(null),
  disciplineEntries: z.array(DisciplineEntrySchema),
  updatedAt: z.string().min(1),
});
export type ThesisDetail = z.infer<typeof ThesisDetailSchema>;
