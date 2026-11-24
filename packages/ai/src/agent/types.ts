import { z } from "zod";

export const AgentProposalTargetSchema = z.enum([
  "variant_perception",
  "key_debate",
  "pre_mortem",
  "exit_rule",
]);
export type AgentProposalTarget = z.infer<typeof AgentProposalTargetSchema>;

export const AgentProposalSchema = z.object({
  id: z.string().min(1),
  target: AgentProposalTargetSchema,
  title: z.string().min(4),
  content: z.string().min(8),
  rationale: z.string().min(6),
  citation: z.string().min(2),
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
  engine: z.enum(["vercel-ai-sdk", "grounded-local"]),
  verdict: z.string().min(6),
  convictionScore: z.number().int().min(0).max(100),
  bullSynthesis: z.string().min(8),
  bearCritique: z.string().min(8),
  accountingCheck: z.string().min(8),
  traces: z.array(AgentTraceStepSchema),
  proposals: z.array(AgentProposalSchema).max(4),
});
export type AgentBriefing = z.infer<typeof AgentBriefingSchema>;

export const AgentRequestSchema = z.object({
  thesisId: z.string().min(1),
});
export type AgentRequest = z.infer<typeof AgentRequestSchema>;

export type AgentStreamEvent =
  | { type: "trace_start"; stepIndex: number; toolName: string; label: string }
  | { type: "trace_done"; trace: AgentTraceStep }
  | { type: "briefing_ready"; briefing: AgentBriefing }
  | { type: "error"; message: string };
