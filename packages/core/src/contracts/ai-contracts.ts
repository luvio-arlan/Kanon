import { z } from "zod";

export const RedTeamChallengeSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(10),
  falsificationPath: z.string().min(10),
  severity: z.enum(["critical", "high", "moderate"]),
  sourceAnchor: z.string().min(1),
});
export type RedTeamChallenge = z.infer<typeof RedTeamChallengeSchema>;

export const RedTeamReportSchema = z.object({
  ticker: z.string().min(1).max(10),
  thesisSummary: z.string().min(10),
  challenges: z.tuple([RedTeamChallengeSchema, RedTeamChallengeSchema, RedTeamChallengeSchema]),
});
export type RedTeamReport = z.infer<typeof RedTeamReportSchema>;

export const EarningsQuoteSchema = z.object({
  topic: z.string().min(1),
  summary: z.string().min(6),
  sourceAnchor: z.string().min(1),
});
export type EarningsQuote = z.infer<typeof EarningsQuoteSchema>;

export const EarningsDigestSchema = z.object({
  ticker: z.string().min(1).max(10),
  quarterLabel: z.string().min(1),
  guidanceSummary: z.string().min(10),
  capexSignals: z.array(z.string().min(4)).min(1).max(4),
  toneShifts: z.array(z.string().min(4)).min(1).max(4),
  quotesWithAnchors: z.array(EarningsQuoteSchema).min(1).max(4),
});
export type EarningsDigest = z.infer<typeof EarningsDigestSchema>;

export const InvestmentMemoSchema = z.object({
  ticker: z.string().min(1).max(10),
  headline: z.string().min(6),
  verdictSummary: z.string().min(10),
  moatAndQuality: z.string().min(10),
  keyEvidence: z.array(z.string().min(6)).min(2).max(5),
  nextQuarterChecklist: z.array(z.string().min(6)).min(2).max(4),
  exitDiscipline: z.string().min(8),
});
export type InvestmentMemo = z.infer<typeof InvestmentMemoSchema>;

export const CopilotActionSchema = z.enum(["earnings_digest", "red_team", "investment_memo"]);
export type CopilotAction = z.infer<typeof CopilotActionSchema>;

export const ByokProviderSchema = z.enum(["gemini", "anthropic", "openai", "openai_compatible"]);
export type ByokProvider = z.infer<typeof ByokProviderSchema>;

export const LocalByokConfigSchema = z.object({
  provider: ByokProviderSchema,
  apiKey: z.string().trim().min(1),
  model: z.string().trim().max(100).optional(),
  baseUrl: z.string().trim().max(240).optional(),
});
export type LocalByokConfig = z.infer<typeof LocalByokConfigSchema>;

export const CopilotRequestSchema = z.object({
  thesisId: z.string().min(1),
  action: CopilotActionSchema,
  sourceText: z.string().max(12000).optional(),
});
export type CopilotRequest = z.infer<typeof CopilotRequestSchema>;

export const CopilotEngineModeSchema = z.enum(["vercel-ai-sdk", "grounded-local"]);
export type CopilotEngineMode = z.infer<typeof CopilotEngineModeSchema>;

export const AgentProposalTargetSchema = z.enum([
  "variant_perception",
  "key_debate",
  "pre_mortem",
  "exit_rule",
  "hypothesis_update",
  "cross_check_draft",
  "catalyst_draft",
]);
export type AgentProposalTarget = z.infer<typeof AgentProposalTargetSchema>;

export const AgentProposalSchema = z.object({
  id: z.string().min(1),
  target: AgentProposalTargetSchema,
  title: z.string().min(4),
  beforePreview: z.string().optional(),
  content: z.string().min(8),
  rationale: z.string().min(6),
  citation: z.string().min(2),
  meta: z
    .object({
      hypothesisIndex: z.number().int().min(0).max(4).optional(),
      hypothesisStatus: z.enum(["validated", "watching", "warning"]).optional(),
      peerCompany: z.string().optional(),
      peerRole: z.enum(["upstream", "downstream", "competitor", "primary"]).optional(),
      topic: z.string().optional(),
      catalystCategory: z
        .enum(["earnings", "product", "capital", "regulatory", "macro"])
        .optional(),
      catalystDateLabel: z.string().optional(),
      catalystMetric: z.string().optional(),
    })
    .optional(),
});
export type AgentProposal = z.infer<typeof AgentProposalSchema>;

export const AgentTraceStepSchema = z.object({
  stepIndex: z.number().int().positive(),
  toolName: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["running", "done"]),
  durationMs: z.number().nonnegative(),
  finding: z.string(),
  citation: z.string(),
});
export type AgentTraceStep = z.infer<typeof AgentTraceStepSchema>;

export const AgentBriefingSchema = z.object({
  ticker: z.string().min(1),
  engine: CopilotEngineModeSchema,
  fallbackReason: z.string().optional(),
  verdict: z.string().min(6),
  convictionScore: z.number().int().min(0).max(100),
  bullSynthesis: z.string().min(8),
  bearCritique: z.string().min(8),
  bearRebuttal: z.string().min(8).optional(),
  accountingCheck: z.string().min(8),
  traces: z.array(AgentTraceStepSchema),
  proposals: z.array(AgentProposalSchema).max(8),
});
export type AgentBriefing = z.infer<typeof AgentBriefingSchema>;

export const AgentPartialSynthesisSchema = z.object({
  engine: CopilotEngineModeSchema,
  verdict: z.string().optional(),
  bullSynthesis: z.string().optional(),
  bearCritique: z.string().optional(),
  bearRebuttal: z.string().optional(),
  accountingCheck: z.string().optional(),
});
export type AgentPartialSynthesis = z.infer<typeof AgentPartialSynthesisSchema>;

export const AgentRequestSchema = z.object({
  thesisId: z.string().min(1),
  sourceText: z.string().max(16000).optional(),
});
export type AgentRequest = z.infer<typeof AgentRequestSchema>;

export const AgentAskRequestSchema = z.object({
  thesisId: z.string().min(1),
  question: z.string().trim().min(4).max(400),
  sourceText: z.string().max(12000).optional(),
});
export type AgentAskRequest = z.infer<typeof AgentAskRequestSchema>;

export const AgentAskResponseSchema = z.object({
  answer: z.string().min(8),
  citations: z.array(z.string()).max(6),
  engine: CopilotEngineModeSchema,
  fallbackReason: z.string().optional(),
});
export type AgentAskResponse = z.infer<typeof AgentAskResponseSchema>;

export const AgentStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("trace_start"),
    stepIndex: z.number().int().positive(),
    toolName: z.string().min(1),
    label: z.string().min(1),
  }),
  z.object({
    type: z.literal("trace_done"),
    trace: AgentTraceStepSchema,
  }),
  z.object({
    type: z.literal("synthesis_partial"),
    partial: AgentPartialSynthesisSchema,
  }),
  z.object({
    type: z.literal("briefing_ready"),
    briefing: AgentBriefingSchema,
    runId: z.string().optional(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string().min(1),
  }),
]);
export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;
