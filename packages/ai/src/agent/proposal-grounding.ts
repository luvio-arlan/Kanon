import { z } from "zod";
import type { AgentProposal } from "./types";

const SafeLlmProposalTargetSchema = z.enum([
  "variant_perception",
  "key_debate",
  "pre_mortem",
  "exit_rule",
]);

export const LlmProposalDraftSchema = z.object({
  id: z.string().min(2).max(40),
  target: SafeLlmProposalTargetSchema,
  title: z.string().min(4).max(80),
  content: z.string().min(12).max(420),
  rationale: z.string().min(6).max(200),
  citation: z.string().min(2).max(120),
});

export type LlmProposalDraft = z.infer<typeof LlmProposalDraftSchema>;

const NUMERIC_FIGURE_RE = /(?:\$\d[\d,]*(?:\.\d+)?[BMK]?|\d[\d,]*(?:\.\d+)?(?:%|bps|x|×|倍|亿))/gi;

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractNormalizedFigures(text: string): string[] {
  return (text.match(NUMERIC_FIGURE_RE) ?? []).map((s) => s.replaceAll(",", "").toLowerCase());
}

function figureExistsInCorpus(fig: string, normalizedCorpus: string): boolean {
  const re = new RegExp(`(?<![\\d.])${escapeRegex(fig)}(?![\\d.])`, "i");
  return re.test(normalizedCorpus);
}

export function isProposalGrounded(draft: LlmProposalDraft, evidenceCorpus: string): boolean {
  const combined = `${draft.title}\n${draft.content}\n${draft.rationale}`;
  const figures = extractNormalizedFigures(combined);
  if (figures.length === 0) return true;
  const normalizedCorpus = evidenceCorpus.replaceAll(",", "").toLowerCase();
  return figures.every((fig) => figureExistsInCorpus(fig, normalizedCorpus));
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
