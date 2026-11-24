export {
  type AgentBriefing,
  AgentBriefingSchema,
  type AgentProposal,
  AgentProposalSchema,
  type AgentProposalTarget,
  AgentProposalTargetSchema,
  type AgentRequest,
  AgentRequestSchema,
  type AgentStreamEvent,
  type AgentTraceStep,
  AgentTraceStepSchema,
} from "@kanon/core";

export interface ResearchToolOutput {
  finding: string;
  citation: string;
  proposal?: import("@kanon/core").AgentProposal;
}
