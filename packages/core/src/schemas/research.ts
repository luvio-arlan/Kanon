import { z } from "zod";
import {
  HypothesisSchema,
  SparklinePointSchema,
  ThesisCardSchema,
  ValuationScenarioInputSchema,
} from "./thesis";

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
});
export type BusinessFilter = z.infer<typeof BusinessFilterSchema>;

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
  note: z.string(),
  createdAt: z.string().min(1),
});
export type DisciplineEntry = z.infer<typeof DisciplineEntrySchema>;

export const CreateDisciplineEntrySchema = DisciplineEntrySchema.omit({
  id: true,
  createdAt: true,
}).refine((entry) => entry.action === "pass" || entry.noLeverageConfirmed, {
  message: "铁律拦截：建仓、加仓或持有操作必须明确确认「零杠杆」原则。",
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

export const SecFilingItemSchema = z.object({
  form: z.string().min(1),
  filingDate: z.string().min(1),
  reportDate: z.string(),
  accessionNumber: z.string().min(1),
  documentUrl: z.string().url(),
  description: z.string(),
});
export type SecFilingItem = z.infer<typeof SecFilingItemSchema>;

export const SecFinancialFactSchema = z.object({
  metric: z.string().min(1),
  label: z.string().min(1),
  valueFormatted: z.string().min(1),
  period: z.string().min(1),
  sourceTag: z.string().min(1),
});
export type SecFinancialFact = z.infer<typeof SecFinancialFactSchema>;

export const SecSnapshotSchema = z.object({
  ticker: z.string().min(1),
  cik: z.string().min(1),
  entityName: z.string().min(1),
  source: z.enum(["sec-edgar-live", "cached-seed"]),
  fetchedAt: z.string().min(1),
  filings: z.array(SecFilingItemSchema),
  facts: z.array(SecFinancialFactSchema),
});
export type SecSnapshot = z.infer<typeof SecSnapshotSchema>;

export const CreateThesisInputSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((value) => value.toUpperCase()),
  companyName: z.string().trim().min(1).max(60),
  sectorTag: z.string().trim().min(1).max(40),
  currentPrice: z.number().finite().positive(),
  convictionSummary: z.string().trim().min(1).max(280).optional(),
});
export type CreateThesisInput = z.input<typeof CreateThesisInputSchema>;

export const UpdateThesisStepSchema = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("business_filter"),
    status: ThesisStatusSchema,
    convictionSummary: z.string().trim().min(1),
    businessFilter: BusinessFilterSchema,
  }),
  z.object({
    step: z.literal("hypotheses"),
    hypotheses: z.tuple([HypothesisSchema, HypothesisSchema, HypothesisSchema]),
  }),
  z.object({
    step: z.literal("cross_checks"),
    crossChecks: z.array(CrossCheckSchema).max(12),
  }),
  z.object({
    step: z.literal("valuation"),
    valuationInput: ValuationScenarioInputSchema,
    priceHistory: z.array(SparklinePointSchema).min(2).optional(),
  }),
]);
export type UpdateThesisStepInput = z.infer<typeof UpdateThesisStepSchema>;

export const ThesisDetailSchema = ThesisCardSchema.extend({
  status: ThesisStatusSchema,
  horizonYears: z.number().int().positive(),
  businessFilter: BusinessFilterSchema,
  crossChecks: z.array(CrossCheckSchema),
  valuationInput: ValuationScenarioInputSchema,
  disciplineEntries: z.array(DisciplineEntrySchema),
  updatedAt: z.string().min(1),
});
export type ThesisDetail = z.infer<typeof ThesisDetailSchema>;
