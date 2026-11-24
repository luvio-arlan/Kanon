import { z } from "zod";
import { SecSnapshotSchema, ThesisDetailSchema, ThesisRevisionSchema } from "../schemas/research";
import {
  CopilotEngineModeSchema,
  EarningsDigestSchema,
  InvestmentMemoSchema,
  RedTeamReportSchema,
} from "./ai-contracts";

export const ApiErrorResponseSchema = z.object({
  error: z.string().min(1),
  code: z.string().optional(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const CreateThesisResponseSchema = z.object({
  thesis: ThesisDetailSchema,
});

export const ThesisMutationResponseSchema = z.object({
  thesis: ThesisDetailSchema,
  revisions: z.array(ThesisRevisionSchema).optional(),
});

export const SecSyncResponseSchema = z.object({
  snapshot: SecSnapshotSchema.nullable(),
  notice: z.string().optional(),
});

export const DeleteOkResponseSchema = z.object({
  ok: z.literal(true),
});

export const CopilotApiResponseSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("red_team"),
    engine: CopilotEngineModeSchema,
    fallbackReason: z.string().optional(),
    data: RedTeamReportSchema,
  }),
  z.object({
    action: z.literal("earnings_digest"),
    engine: CopilotEngineModeSchema,
    fallbackReason: z.string().optional(),
    data: EarningsDigestSchema,
  }),
  z.object({
    action: z.literal("investment_memo"),
    engine: CopilotEngineModeSchema,
    fallbackReason: z.string().optional(),
    data: InvestmentMemoSchema,
  }),
]);
export type CopilotApiResponse = z.infer<typeof CopilotApiResponseSchema>;
