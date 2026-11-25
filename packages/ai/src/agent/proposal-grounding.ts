import { z } from "zod";
import { type AgentProposal, AgentProposalTargetSchema } from "./types";

export const LlmProposalDraftSchema = z.object({
  id: z.string().min(2).max(40),
  target: AgentProposalTargetSchema,
  title: z.string().min(4).max(80),
  content: z.string().min(12).max(420),
  rationale: z.string().min(6).max(200),
  citation: z.string().min(2).max(120),
});

export type LlmProposalDraft = z.infer<typeof LlmProposalDraftSchema>;

const NUMERIC_FIGURE_RE = /(?:\$\d+(?:\.\d+)?|\d+(?:\.\d+)?%|\d+(?:\.\d+)?x)/gi;

function extractNormalizedFigures(text: string): string[] {
  return (text.match(NUMERIC_FIGURE_RE) ?? []).map((s) => s.toLowerCase());
}

export function isProposalGrounded(draft: LlmProposalDraft, evidenceCorpus: string): boolean {
  const figures = extractNormalizedFigures(draft.content);
  if (figures.length === 0) return true;
  const lowerCorpus = evidenceCorpus.toLowerCase();
  const ungrounded = figures.filter((fig) => !lowerCorpus.includes(fig));
  return ungrounded.length <= 1;
}

function pickGroundedLlmProposals(
  llmDrafts: readonly LlmProposalDraft[],
  evidenceCorpus: string,
): { accepted: AgentProposal[]; usedTargets: Set<string> } {
  const accepted: AgentProposal[] = [];
  const usedTargets = new Set<string>();
  for (const draft of llmDrafts) {
    if (!isProposalGrounded(draft, evidenceCorpus)) continue;
    const cleanId = draft.id.replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || String(accepted.length);
    accepted.push({
      id: `llm-${cleanId}`,
      target: draft.target,
      title: draft.title,
      content: draft.content,
      rationale: draft.rationale,
      citation: draft.citation,
    });
    usedTargets.add(draft.target);
    if (accepted.length >= 3) break;
  }
  return { accepted, usedTargets };
}

export function mergeGroundedProposals(params: {
  llmDrafts?: readonly LlmProposalDraft[];
  deterministic: readonly AgentProposal[];
  evidenceCorpus: string;
}): AgentProposal[] {
  const { accepted, usedTargets } = pickGroundedLlmProposals(
    params.llmDrafts ?? [],
    params.evidenceCorpus,
  );
  for (const base of params.deterministic) {
    if (usedTargets.has(base.target) && base.target !== "hypothesis_update") continue;
    accepted.push(base);
    if (accepted.length >= 8) break;
  }
  return accepted.slice(0, 8);
}
