import { z } from "zod";
import {
  QuarterlyReviewSchema,
  ResearchNoteSchema,
  SavedCopilotOutputSchema,
  SecSnapshotSchema,
  ThesisDetailSchema,
  ThesisRevisionSchema,
} from "../schemas/research";
import { SparklinePointSchema } from "../schemas/thesis";
import {
  AgentBriefingSchema,
  CopilotEngineModeSchema,
  EarningsDigestSchema,
  InvestmentMemoSchema,
  RedTeamReportSchema,
} from "./ai-contracts";
import { MarketQuoteSnapshotSchema } from "./market-contracts";

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

export const ResearchNoteCreateResponseSchema = z.object({
  note: ResearchNoteSchema,
});

export const ManualSecSaveResponseSchema = z.object({
  snapshot: SecSnapshotSchema,
  notice: z.string().optional(),
});

export const DeleteOkResponseSchema = z.object({
  ok: z.literal(true),
});

export const MarketBootstrapResponseSchema = z.object({
  ticker: z.string().min(1),
  companyName: z.string(),
  currentPrice: z.number().nullable(),
  priceSource: z.enum(["fmp", "yahoo", "finnhub", "polygon", "cached", "none"]),
  latestEps: z.number().nullable(),
  secYearsCovered: z.number().int().nonnegative(),
  secCached: z.boolean(),
  notice: z.string(),
  quote: MarketQuoteSnapshotSchema.nullable().optional(),
  sparkline: z.array(SparklinePointSchema).optional(),
});
export type MarketBootstrapResponse = z.infer<typeof MarketBootstrapResponseSchema>;

export const RefreshPricesResponseSchema = z.object({
  updatedTheses: z.array(ThesisDetailSchema),
  updatedCount: z.number().int().nonnegative(),
  skippedTickers: z.array(z.string()),
  notice: z.string(),
  sessionMode: z.enum(["regular", "extended"]).optional(),
  quotes: z.record(z.string(), MarketQuoteSnapshotSchema).optional(),
});
export type RefreshPricesResponse = z.infer<typeof RefreshPricesResponseSchema>;

export const SavedAgentRunSchema = z.object({
  id: z.string().min(1),
  thesisId: z.string().min(1),
  engine: CopilotEngineModeSchema,
  fallbackReason: z.string().nullable(),
  briefing: AgentBriefingSchema,
  appliedProposalIds: z.array(z.string()),
  createdAt: z.string().min(1),
});
export type SavedAgentRun = z.infer<typeof SavedAgentRunSchema>;

export const AgentApplyRequestSchema = z
  .object({
    runId: z.string().min(1),
    proposalId: z.string().min(1).optional(),
    proposalIds: z.array(z.string().min(1)).max(8).optional(),
  })
  .refine((v) => Boolean(v.proposalId || (v.proposalIds && v.proposalIds.length > 0)), {
    message: "至少需要提供一个待采纳的提案编号。",
  });

export const AgentApplyResponseSchema = z.object({
  ok: z.literal(true),
  appliedProposalIds: z.array(z.string()),
  thesis: ThesisDetailSchema.optional(),
  revisions: z.array(ThesisRevisionSchema).optional(),
  promotedExitRules: z.array(z.string()).optional(),
});

export const AgentRunsListResponseSchema = z.object({
  runs: z.array(SavedAgentRunSchema),
});

export const QuarterlyReviewCreateResponseSchema = z.object({
  thesis: ThesisDetailSchema,
  review: QuarterlyReviewSchema,
  revisions: z.array(ThesisRevisionSchema),
});

export const ThesisArchiveImportRequestSchema = z.object({
  archive: z.object({
    schemaVersion: z.string().optional(),
    thesis: ThesisDetailSchema,
    secSnapshot: SecSnapshotSchema.nullable().optional(),
    quarterlyReviews: z.array(QuarterlyReviewSchema).optional(),
    copilotOutputs: z.array(SavedCopilotOutputSchema).optional(),
    agentRuns: z.array(SavedAgentRunSchema).optional(),
  }),
  mode: z.enum(["create_copy", "overwrite"]).default("create_copy"),
});
export type ThesisArchiveImportRequest = z.infer<typeof ThesisArchiveImportRequestSchema>;

export const ThesisArchiveImportResponseSchema = z.object({
  thesis: ThesisDetailSchema,
  mode: z.enum(["create_copy", "overwrite"]),
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
