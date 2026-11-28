import { z } from "zod";
import { TickerSymbolSchema } from "../../schemas/research";
import { IsoDateSchema } from "./primitives";

export const SegmentAxisSchema = z.enum(["business", "geography", "product"]);
export type SegmentAxis = z.infer<typeof SegmentAxisSchema>;

export const SegmentReportStatusSchema = z.enum([
  "reconciled",
  "unreconciled",
  "single_segment",
  "no_dimensional_data",
  "parse_failed",
  "too_large",
]);
export type SegmentReportStatus = z.infer<typeof SegmentReportStatusSchema>;

export const SegmentImportBlockerSchema = z.enum([
  "unreconciled",
  "single_segment",
  "custom_profit_measure",
  "negative_profit_segment",
  "has_eliminations",
  "fx_missing",
  "quarterly_period",
]);
export type SegmentImportBlocker = z.infer<typeof SegmentImportBlockerSchema>;

export const SegmentLineKindSchema = z.enum(["segment", "elimination", "corporate", "reconciling"]);
export type SegmentLineKind = z.infer<typeof SegmentLineKindSchema>;

export const SegmentLineSchema = z.object({
  memberQname: z.string().max(200),
  label: z.string().max(120),
  labelSource: z.enum(["label_linkbase", "qname"]),
  kind: SegmentLineKindSchema,
  revenue: z.number().finite().nullable(),
  operatingIncome: z.number().finite().nullable(),
});
export type SegmentLine = z.infer<typeof SegmentLineSchema>;

export const SegmentReportSchema = z.object({
  accession: z.string(),
  form: z.string(),
  periodKind: z.enum(["annual", "quarter"]).default("annual"),
  axis: SegmentAxisSchema,
  periodStart: IsoDateSchema,
  periodEnd: IsoDateSchema,
  currency: z.string().length(3),
  fxToUsd: z.number().positive().nullable(),
  revenueConcept: z.string().default("us-gaap:Revenues"),
  profitConcept: z.string().nullable().default(null),
  status: SegmentReportStatusSchema,
  diffPct: z.number().finite().nullable(),
  profitIsStandard: z.boolean(),
  profitReconciled: z.boolean().default(false),
  lines: z.array(SegmentLineSchema).max(40),
  importable: z.object({
    revenue: z.boolean(),
    operatingIncome: z.boolean(),
    blockers: z.array(SegmentImportBlockerSchema).max(7),
  }),
});
export type SegmentReport = z.infer<typeof SegmentReportSchema>;

export const SegmentsResponseSchema = z.object({
  ticker: TickerSymbolSchema,
  status: z.enum(["ready", "pending", "unavailable"]),
  reports: z.array(SegmentReportSchema).max(6),
});
export type SegmentsResponse = z.infer<typeof SegmentsResponseSchema>;

export const SegmentsPostRequestSchema = z.object({
  op: z.literal("refresh"),
  accession: z
    .string()
    .regex(/^\d{10}-\d{2}-\d{6}$/)
    .optional(),
});
export type SegmentsPostRequest = z.infer<typeof SegmentsPostRequestSchema>;
