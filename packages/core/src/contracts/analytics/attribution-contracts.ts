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
  judgmentVerdict: z.enum(["right", "wrong", "pending"]),
  quadrant: DecisionQuadrantSchema,
  snapshotHash: z.string().nullable(),
  hypothesesCount: z.number().int().min(0),
  validatedCount: z.number().int().min(0),
  invalidatedCount: z.number().int().min(0),
});
export type DecisionEpisode = z.infer<typeof DecisionEpisodeSchema>;

export const PortfolioAttributionResponseSchema = z.object({
  status: z.enum(["ready", "empty"]),
  counts: z.object({
    skill: z.number().int().min(0),
    good_process_bad_luck: z.number().int().min(0),
    lucky: z.number().int().min(0),
    mistake: z.number().int().min(0),
    pending: z.number().int().min(0),
  }),
  skillRatePct: z.number().finite().nullable(),
  episodes: z.array(DecisionEpisodeSchema),
});
export type PortfolioAttributionResponse = z.infer<typeof PortfolioAttributionResponseSchema>;
