import { z } from "zod";
import { IsoDateSchema } from "../intel/primitives";

export const DecisionQuadrantSchema = z.enum([
  "skill",
  "good_process_bad_luck",
  "lucky",
  "mistake",
  "pending",
]);
export type DecisionQuadrant = z.infer<typeof DecisionQuadrantSchema>;

export const OutcomeBasisSchema = z.enum(["idiosyncratic", "excess_vs_spy", "unavailable"]);
export type OutcomeBasis = z.infer<typeof OutcomeBasisSchema>;

export const EpisodePendingReasonSchema = z.enum([
  "no_snapshot",
  "pre_history",
  "hypotheses_open",
  "no_benchmark",
]);
export type EpisodePendingReason = z.infer<typeof EpisodePendingReasonSchema>;

export const DecisionEpisodeSchema = z.object({
  id: z.string().min(1),
  thesisId: z.string().nullable(),
  ticker: z.string().min(1),
  openDate: IsoDateSchema,
  closeDate: IsoDateSchema.nullable(),
  status: z.enum(["open", "closed"]),
  entryPrice: z.number().finite(),
  exitOrMarkPrice: z.number().finite(),
  totalReturnPct: z.number().finite(),
  spyReturnPct: z.number().finite().nullable(),
  pitBeta: z.number().finite().nullable(),
  idioReturnPct: z.number().finite().nullable(),
  outcomeBasis: OutcomeBasisSchema.default("unavailable"),
  pendingReason: EpisodePendingReasonSchema.nullable().default(null),
  judgmentVerdict: z.enum(["right", "wrong", "pending"]),
  quadrant: DecisionQuadrantSchema,
  snapshotHash: z.string().nullable(),
  hypothesesCount: z.number().int().min(0),
  validatedCount: z.number().int().min(0),
  invalidatedCount: z.number().int().min(0),
});
export type DecisionEpisode = z.infer<typeof DecisionEpisodeSchema>;

export const PortfolioAttributionResponseSchema = z.object({
  status: z.enum(["ready", "empty", "currency_unconfirmed"]),
  counts: z.object({
    skill: z.number().int().min(0),
    good_process_bad_luck: z.number().int().min(0),
    lucky: z.number().int().min(0),
    mistake: z.number().int().min(0),
    pending: z.number().int().min(0),
  }),
  outcomeBasisCounts: z
    .object({
      idiosyncratic: z.number().int().min(0),
      excess_vs_spy: z.number().int().min(0),
      unavailable: z.number().int().min(0),
    })
    .default({ idiosyncratic: 0, excess_vs_spy: 0, unavailable: 0 }),
  skillRatePct: z.number().finite().nullable(),
  episodes: z.array(DecisionEpisodeSchema),
});
export type PortfolioAttributionResponse = z.infer<typeof PortfolioAttributionResponseSchema>;
