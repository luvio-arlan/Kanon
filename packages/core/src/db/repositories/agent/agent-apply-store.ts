import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { AgentBriefingSchema, type AgentProposal } from "../../../contracts/ai-contracts";
import type { SavedAgentRun } from "../../../contracts/api-contracts";
import type { ThesisDetail, ThesisRevision } from "../../../schemas/research";
import { type KanonDb, runInTransaction } from "../../client";
import {
  agentRunsTable,
  crossChecksTable,
  hypothesesTable,
  thesesTable,
  thesisCatalystsTable,
} from "../../schema";
import { listThesisRevisions, recordThesisRevision } from "../revision-queries";
import { getThesisById } from "../thesis-queries";

export async function listAgentRuns(
  db: KanonDb,
  thesisId: string,
  limit = 5,
): Promise<SavedAgentRun[]> {
  const rows = await db
    .select()
    .from(agentRunsTable)
    .where(eq(agentRunsTable.thesisId, thesisId))
    .orderBy(desc(agentRunsTable.createdAt))
    .limit(limit);

  const runs: SavedAgentRun[] = [];
  for (const row of rows) {
    const parsed = AgentBriefingSchema.safeParse(row.briefingJson);
    if (!parsed.success) continue;
    runs.push({
      id: row.id,
      thesisId: row.thesisId,
      engine: row.engine,
      fallbackReason: row.fallbackReason ?? null,
      briefing: parsed.data,
      appliedProposalIds: row.appliedProposalIds ?? [],
      createdAt: row.createdAt.toISOString(),
    });
  }
  return runs;
}

const FILTER_KEY_BY_TARGET: Partial<
  Record<AgentProposal["target"], "variantPerception" | "keyDebate" | "preMortem">
> = {
  variant_perception: "variantPerception",
  key_debate: "keyDebate",
  pre_mortem: "preMortem",
};

async function applyHypothesisProposal(tx: KanonDb, thesis: ThesisDetail, prop: AgentProposal) {
  const idx = prop.meta?.hypothesisIndex ?? 0;
  const targetHyp = thesis.hypotheses[idx];
  if (!targetHyp) return;
  await tx
    .update(hypothesesTable)
    .set({ status: prop.meta?.hypothesisStatus ?? targetHyp.status, note: prop.content })
    .where(and(eq(hypothesesTable.id, targetHyp.id), eq(hypothesesTable.thesisId, thesis.id)));
}

async function applySingleProposal(
  tx: KanonDb,
  thesis: ThesisDetail,
  prop: AgentProposal,
  promotedExitRules: string[],
) {
  if (prop.target === "exit_rule") {
    promotedExitRules.push(prop.content);
    return;
  }
  if (prop.target === "hypothesis_update") {
    await applyHypothesisProposal(tx, thesis, prop);
    return;
  }
  if (prop.target === "catalyst_draft") {
    await tx.insert(thesisCatalystsTable).values({
      id: `cat-ag-${crypto.randomUUID().slice(0, 6)}`,
      thesisId: thesis.id,
      title: prop.title.slice(0, 120),
      dateLabel: prop.meta?.catalystDateLabel ?? "下一季财报",
      category: prop.meta?.catalystCategory ?? "earnings",
      impact: "high",
      direction: "bullish",
      status: "upcoming",
      verificationMetric: prop.meta?.catalystMetric ?? "核心业绩与毛利率指引",
      note: prop.content.slice(0, 380),
    });
    return;
  }
  if (prop.target === "cross_check_draft") {
    await tx.insert(crossChecksTable).values({
      id: `cc-ag-${crypto.randomUUID().slice(0, 6)}`,
      thesisId: thesis.id,
      peerCompany: prop.meta?.peerCompany ?? "产业链上下游伙伴",
      peerRole: prop.meta?.peerRole ?? "upstream",
      topic: prop.meta?.topic ?? prop.title,
      sourceAnchor: prop.citation,
      statement: prop.content,
      alignment: "pending",
      takeaway: prop.rationale,
    });
  }
}

function mergeFilterUpdates(
  thesis: ThesisDetail,
  proposals: readonly AgentProposal[],
): ThesisDetail["businessFilter"] | null {
  let nextFilter: ThesisDetail["businessFilter"] | null = null;
  for (const prop of proposals) {
    const key = FILTER_KEY_BY_TARGET[prop.target];
    if (!key) continue;
    nextFilter = { ...(nextFilter ?? thesis.businessFilter), [key]: prop.content };
  }
  return nextFilter;
}

async function applyPendingBatch(
  tx: KanonDb,
  thesis: ThesisDetail,
  pendingProposals: readonly AgentProposal[],
): Promise<string[]> {
  const promotedExitRules: string[] = [];
  if (pendingProposals.length === 0) return promotedExitRules;
  const mergedFilter = mergeFilterUpdates(thesis, pendingProposals);
  if (mergedFilter) {
    await tx
      .update(thesesTable)
      .set({
        businessFilter: mergedFilter,
        lastReviewedLabel: "刚刚采纳 · 投委会修订",
        updatedAt: new Date(),
      })
      .where(eq(thesesTable.id, thesis.id));
  }
  for (const prop of pendingProposals) {
    await applySingleProposal(tx, thesis, prop, promotedExitRules);
  }
  return promotedExitRules;
}

export interface AtomicAgentApplyResult {
  appliedProposalIds: string[];
  thesis: ThesisDetail;
  revisions: ThesisRevision[];
  promotedExitRules: string[];
}

async function loadAuthorizedRunContext(
  tx: KanonDb,
  runId: string,
  userId?: string,
): Promise<{
  proposals: AgentProposal[];
  appliedProposalIds: string[];
  thesis: ThesisDetail;
} | null> {
  const [row] = await tx
    .select({ run: agentRunsTable, ownerId: thesesTable.userId })
    .from(agentRunsTable)
    .innerJoin(thesesTable, eq(agentRunsTable.thesisId, thesesTable.id))
    .where(eq(agentRunsTable.id, runId))
    .for("update");
  if (!row || (userId && row.ownerId !== userId)) return null;
  const parsed = AgentBriefingSchema.safeParse(row.run.briefingJson);
  const thesis = await getThesisById(tx, row.run.thesisId, userId);
  if (!thesis) return null;
  return {
    proposals: parsed.success ? parsed.data.proposals : [],
    appliedProposalIds: row.run.appliedProposalIds ?? [],
    thesis,
  };
}

export async function applyAgentProposalsAtomic(
  db: KanonDb,
  params: { runId: string; proposalIds: readonly string[]; userId?: string },
): Promise<AtomicAgentApplyResult | null> {
  return runInTransaction(db, async (tx) => {
    const ctx = await loadAuthorizedRunContext(tx, params.runId, params.userId);
    if (!ctx) return null;

    const validIds = new Set(ctx.proposals.map((p) => p.id));
    const requested = new Set(params.proposalIds.filter((id) => validIds.has(id)));
    const pending = ctx.proposals.filter(
      (p) => requested.has(p.id) && !ctx.appliedProposalIds.includes(p.id),
    );
    const nextApplied = [...new Set([...ctx.appliedProposalIds, ...requested])];
    const promotedExitRules = await applyPendingBatch(tx, ctx.thesis, pending);

    await tx
      .update(agentRunsTable)
      .set({ appliedProposalIds: nextApplied })
      .where(eq(agentRunsTable.id, params.runId));

    const updated = await getThesisById(tx, ctx.thesis.id, params.userId);
    if (!updated) return null;
    if (pending.some((p) => p.target !== "exit_rule")) {
      await recordThesisRevision(
        tx,
        updated,
        "business_filter",
        `人机共审采纳 ${pending.length} 项投委会提案`,
      );
    }
    const revisions = await listThesisRevisions(tx, ctx.thesis.id);
    return { appliedProposalIds: nextApplied, thesis: updated, revisions, promotedExitRules };
  });
}
