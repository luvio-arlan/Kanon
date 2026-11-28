import { z } from "zod";
import { IsoDateSchema } from "./primitives";

export const GuidanceMetricSchema = z.enum([
  "revenue",
  "gross_margin",
  "operating_margin",
  "diluted_eps",
  "capex",
  "operating_expenses",
  "free_cash_flow",
  "custom",
]);
export type GuidanceMetric = z.infer<typeof GuidanceMetricSchema>;

export const GuidanceBasisSchema = z.enum(["gaap", "non_gaap", "unspecified"]);
export type GuidanceBasis = z.infer<typeof GuidanceBasisSchema>;

export const GuidanceUnitSchema = z.enum(["usd", "pct", "usd_per_share"]);
export type GuidanceUnit = z.infer<typeof GuidanceUnitSchema>;

export const GuidanceFiscalPeriodSchema = z.enum(["FY", "Q1", "Q2", "Q3", "Q4"]);
export type GuidanceFiscalPeriod = z.infer<typeof GuidanceFiscalPeriodSchema>;

export const GuidanceStatusSchema = z.enum([
  "draft_ai",
  "draft_legacy",
  "confirmed",
  "withdrawn",
  "superseded",
]);
export type GuidanceStatus = z.infer<typeof GuidanceStatusSchema>;

export const GuidanceOutcomeSchema = z.enum(["beat", "in_line", "miss", "unresolvable"]);
export type GuidanceOutcome = z.infer<typeof GuidanceOutcomeSchema>;

export const GuidanceSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("filing_chunk"),
    chunkId: z.string().min(1).max(200),
    quote: z.string().trim().min(12).max(600),
  }),
  z.object({
    kind: z.literal("research_note"),
    noteId: z.string().min(1).max(80),
    quote: z.string().trim().min(12).max(600),
  }),
  z.object({
    kind: z.literal("manual"),
    url: z.string().url().max(500),
    quote: z.string().trim().min(12).max(600),
  }),
]);
export type GuidanceSource = z.infer<typeof GuidanceSourceSchema>;

function assertGuidanceRangeAndUnit(
  val: {
    metric: GuidanceMetric;
    unit: GuidanceUnit;
    low: number | null;
    high: number | null;
  },
  ctx: z.RefinementCtx,
) {
  if (val.low === null && val.high === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["low"], message: "指引区间至少填写一端。" });
  }
  if (val.low !== null && val.high !== null && val.low > val.high) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["high"], message: "下限不得高于上限。" });
  }
  const isMargin = val.metric === "gross_margin" || val.metric === "operating_margin";
  if (isMargin && val.unit !== "pct") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unit"],
      message: "利润率指引必须使用 pct 单位。",
    });
  }
  if (val.metric === "diluted_eps" && val.unit !== "usd_per_share") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unit"],
      message: "EPS 指引必须使用 usd_per_share 单位。",
    });
  }
}

export const GuidanceInputSchema = z
  .object({
    metric: GuidanceMetricSchema,
    customLabel: z.string().trim().max(60).optional(),
    basis: GuidanceBasisSchema,
    unit: GuidanceUnitSchema,
    targetFiscalYear: z.number().int().min(1990).max(2100),
    targetFiscalPeriod: GuidanceFiscalPeriodSchema,
    issuedOn: IsoDateSchema,
    low: z.number().finite().nullable(),
    high: z.number().finite().nullable(),
    source: GuidanceSourceSchema,
  })
  .superRefine(assertGuidanceRangeAndUnit);
export type GuidanceInput = z.infer<typeof GuidanceInputSchema>;

export const GuidanceDraftSchema = z.object({
  metric: GuidanceMetricSchema,
  customLabel: z.string().trim().max(60).nullable().optional(),
  basis: GuidanceBasisSchema.default("unspecified"),
  unit: GuidanceUnitSchema.nullable().optional(),
  targetFiscalYear: z.number().int().min(1990).max(2100).nullable().optional(),
  targetFiscalPeriod: GuidanceFiscalPeriodSchema.nullable().optional(),
  low: z.number().finite().nullable().optional(),
  high: z.number().finite().nullable().optional(),
  quote: z.string().trim().min(12).max(600),
});
export type GuidanceDraft = z.infer<typeof GuidanceDraftSchema>;

export const GuidanceCommitmentSchema = z.object({
  id: z.string(),
  thesisId: z.string(),
  securityId: z.string().nullable(),
  createdBy: z.string(),
  metric: GuidanceMetricSchema,
  customLabel: z.string().nullable(),
  basis: GuidanceBasisSchema,
  unit: GuidanceUnitSchema.nullable(),
  currency: z.string(),
  targetFiscalYear: z.number().int().nullable(),
  targetFiscalPeriod: GuidanceFiscalPeriodSchema.nullable(),
  targetPeriodEnd: IsoDateSchema.nullable(),
  issuedOn: IsoDateSchema,
  low: z.number().finite().nullable(),
  high: z.number().finite().nullable(),
  sourceKind: z.enum(["filing_chunk", "research_note", "manual"]),
  sourceRef: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  quote: z.string(),
  status: GuidanceStatusSchema,
  supersedesId: z.string().nullable(),
  confirmedBy: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  actualValue: z.number().finite().nullable(),
  actualRestated: z.boolean().optional(),
  outcome: GuidanceOutcomeSchema.nullable(),
  surprise: z.number().finite().nullable(),
  resolvedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type GuidanceCommitment = z.infer<typeof GuidanceCommitmentSchema>;

export const GuidanceCredibilitySchema = z.object({
  resolved: z.number().int().min(0),
  kept: z.number().int().min(0),
  beat: z.number().int().min(0),
  miss: z.number().int().min(0),
  initialKeptRatio: z
    .string()
    .regex(/^\d+\/\d+$/)
    .nullable(),
  latestKeptRatio: z
    .string()
    .regex(/^\d+\/\d+$/)
    .nullable(),
  keptRatio: z
    .string()
    .regex(/^\d+\/\d+$/)
    .nullable(),
  meanSurprisePct: z.number().finite().nullable(),
  style: z.enum(["conservative", "balanced", "aggressive"]).nullable(),
  revisionsPerPeriod: z.number().finite().nullable(),
});
export type GuidanceCredibility = z.infer<typeof GuidanceCredibilitySchema>;

export const GuidancePostRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), input: GuidanceInputSchema }),
  z.object({
    op: z.literal("confirm"),
    id: z.string().min(1),
    expectedUpdatedAt: z.string().min(1),
  }),
  z.object({ op: z.literal("withdraw"), id: z.string().min(1) }),
  z.object({ op: z.literal("draft_from_note"), noteId: z.string().min(1) }),
  z.object({
    op: z.literal("record_actual"),
    id: z.string().min(1),
    actualValue: z.number().finite(),
    source: z.object({ url: z.string().url().max(500), quote: z.string().trim().min(12).max(600) }),
  }),
]);
export type GuidancePostRequest = z.infer<typeof GuidancePostRequestSchema>;

export const GuidancePatchRequestSchema = z.object({
  id: z.string().min(1),
  metric: GuidanceMetricSchema.optional(),
  customLabel: z.string().trim().max(60).nullable().optional(),
  basis: GuidanceBasisSchema.optional(),
  unit: GuidanceUnitSchema.optional(),
  targetFiscalYear: z.number().int().min(1990).max(2100).optional(),
  targetFiscalPeriod: GuidanceFiscalPeriodSchema.optional(),
  low: z.number().finite().nullable().optional(),
  high: z.number().finite().nullable().optional(),
  quote: z.string().trim().min(12).max(600).optional(),
});
export type GuidancePatchRequest = z.infer<typeof GuidancePatchRequestSchema>;

export const GuidanceLedgerResponseSchema = z.object({
  items: z.array(GuidanceCommitmentSchema).max(400),
  credibility: GuidanceCredibilitySchema,
});
export type GuidanceLedgerResponse = z.infer<typeof GuidanceLedgerResponseSchema>;
