import { z } from "zod";
import { TickerSymbolSchema } from "../../schemas/research";
import { IsoDateSchema } from "./primitives";

export const RedlineSectionSchema = z.enum(["risk_factors", "mda"]);
export type RedlineSection = z.infer<typeof RedlineSectionSchema>;

export const RedlineChangeKindSchema = z.enum([
  "added_risk",
  "removed_risk",
  "hedging_up",
  "optimism_removed",
  "definition_change",
  "rewritten",
  "numbers_only",
]);
export type RedlineChangeKind = z.infer<typeof RedlineChangeKindSchema>;

export const RedlineTokenSchema = z.object({
  op: z.enum(["eq", "ins", "del"]),
  text: z.string().max(4000),
});
export type RedlineToken = z.infer<typeof RedlineTokenSchema>;

export const RedlineChangeSchema = z.object({
  id: z.string().min(1).max(160),
  section: RedlineSectionSchema,
  kind: RedlineChangeKindSchema,
  severity: z.enum(["critical", "warn", "info"]),
  currentChunkId: z.string().max(200).nullable(),
  previousChunkId: z.string().max(200).nullable(),
  similarity: z.number().min(0).max(1).nullable(),
  tokens: z.array(RedlineTokenSchema).max(600),
  cues: z.array(z.string().max(40)).max(12),
});
export type RedlineChange = z.infer<typeof RedlineChangeSchema>;

export const FilingRefSchema = z.object({
  accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
  form: z.string().max(12),
  filedAt: IsoDateSchema,
  periodEnd: IsoDateSchema.nullable(),
});
export type FilingRef = z.infer<typeof FilingRefSchema>;

export const RedlineStatsSchema = z.object({
  added: z.number().int().min(0),
  removed: z.number().int().min(0),
  modified: z.number().int().min(0),
  numbersOnly: z.number().int().min(0),
  critical: z.number().int().min(0),
});
export type RedlineStats = z.infer<typeof RedlineStatsSchema>;

export const FilingRedlineStatusSchema = z.enum([
  "ready",
  "pending",
  "no_comparable",
  "section_missing",
  "too_large",
  "failed",
]);
export type FilingRedlineStatus = z.infer<typeof FilingRedlineStatusSchema>;

export const FilingRedlineResponseSchema = z.object({
  ticker: TickerSymbolSchema,
  status: FilingRedlineStatusSchema,
  algoVersion: z.enum(["redline/1", "redline/2"]),
  current: FilingRefSchema.nullable(),
  previous: FilingRefSchema.nullable(),
  stats: RedlineStatsSchema.nullable(),
  changes: z.array(RedlineChangeSchema).max(400),
});
export type FilingRedlineResponse = z.infer<typeof FilingRedlineResponseSchema>;
