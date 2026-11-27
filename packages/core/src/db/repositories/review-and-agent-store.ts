import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { type AgentBriefing, AgentBriefingSchema } from "../../contracts/ai-contracts";
import type { SavedAgentRun } from "../../contracts/api-contracts";
import {
  type CreateQuarterlyReviewInput,
  CreateQuarterlyReviewSchema,
  type QuarterlyReview,
  type ThesisDetail,
} from "../../schemas/research";
import { type KanonDb, runInTransaction } from "../client";
import { agentRunsTable, hypothesesTable, quarterlyReviewsTable, thesesTable } from "../schema";
import { appendHypothesisStatusEvent } from "./portfolio/hypothesis-events-store";
import { recordThesisRevision } from "./revision-queries";
import { assertThesisAccess } from "./thesis/thesis-access";
import { getThesisById } from "./thesis-queries";

export async function saveAgentRun(
  db: KanonDb,
  input: {
    thesisId: string;
    engine: "vercel-ai-sdk" | "grounded-local";
    fallbackReason?: string | null;
    briefing: AgentBriefing;
  },
): Promise<SavedAgentRun> {
  const now = new Date();
  const id = `run-${crypto.randomUUID().slice(0, 10)}`;
  const briefing = AgentBriefingSchema.parse(input.briefing);
  const record = {
    id,
    thesisId: input.thesisId,
    engine: input.engine,
    fallbackReason: input.fallbackReason ?? null,
    briefing,
    appliedProposalIds: [] as string[],
  };
  await db.insert(agentRunsTable).values({
    id,
    thesisId: input.thesisId,
    engine: input.engine,
    fallbackReason: record.fallbackReason,
    briefingJson: briefing,
    appliedProposalIds: [],
    createdAt: now,
  });
  return { ...record, createdAt: now.toISOString() };
}

export async function getLatestAgentRun(
  db: KanonDb,
  thesisId: string,
): Promise<SavedAgentRun | null> {
  const [row] = await db
    .select()
    .from(agentRunsTable)
    .where(eq(agentRunsTable.thesisId, thesisId))
    .orderBy(desc(agentRunsTable.createdAt))
    .limit(1);
  if (!row) return null;
  const parsed = AgentBriefingSchema.safeParse(row.briefingJson);
  if (!parsed.success) return null;
  return {
    id: row.id,
    thesisId: row.thesisId,
    engine: row.engine,
    fallbackReason: row.fallbackReason ?? null,
    briefing: parsed.data,
    appliedProposalIds: row.appliedProposalIds ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function markAgentProposalApplied(
  db: KanonDb,
  runId: string,
  proposalId: string,
  userId?: string,
): Promise<string[] | null> {
  const [row] = await db
    .select({
      id: agentRunsTable.id,
      thesisId: agentRunsTable.thesisId,
      appliedProposalIds: agentRunsTable.appliedProposalIds,
    })
    .from(agentRunsTable)
    .where(eq(agentRunsTable.id, runId));
  if (!row) return null;
  if (userId && !(await assertThesisAccess(db, row.thesisId, userId, "write"))) return null;
  const existing = row.appliedProposalIds ?? [];
  const next = existing.includes(proposalId) ? existing : [...existing, proposalId];
  await db
    .update(agentRunsTable)
    .set({ appliedProposalIds: next })
    .where(and(eq(agentRunsTable.id, runId), eq(agentRunsTable.thesisId, row.thesisId)));
  return next;
}

export async function listQuarterlyReviews(
  db: KanonDb,
  thesisId: string,
): Promise<QuarterlyReview[]> {
  const rows = await db
    .select()
    .from(quarterlyReviewsTable)
    .where(eq(quarterlyReviewsTable.thesisId, thesisId))
    .orderBy(desc(quarterlyReviewsTable.createdAt));

  return rows.map((row) => ({
    id: row.id,
    thesisId: row.thesisId,
    quarterLabel: row.quarterLabel,
    summary: row.summary,
    hypothesisVerdicts: row.hypothesisVerdicts,
    priceAtReview: row.priceAtReview,
    baseTargetAtReview: row.baseTargetAtReview,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listQuarterlyReviewsByThesisIds(
  db: KanonDb,
  thesisIds: readonly string[],
): Promise<QuarterlyReview[]> {
  if (thesisIds.length === 0) return [];
  const rows = await db
    .select()
    .from(quarterlyReviewsTable)
    .where(inArray(quarterlyReviewsTable.thesisId, [...thesisIds]))
    .orderBy(desc(quarterlyReviewsTable.createdAt));

  return rows.map((row) => ({
    id: row.id,
    thesisId: row.thesisId,
    quarterLabel: row.quarterLabel,
    summary: row.summary,
    hypothesisVerdicts: row.hypothesisVerdicts,
    priceAtReview: row.priceAtReview,
    baseTargetAtReview: row.baseTargetAtReview,
    createdAt: row.createdAt.toISOString(),
  }));
}

async function applyVerdictStatuses(
  tx: KanonDb,
  thesis: ThesisDetail,
  verdicts: CreateQuarterlyReviewInput["hypothesisVerdicts"],
) {
  for (const v of verdicts) {
    const match = thesis.hypotheses.find((h) => h.id === v.hypothesisId);
    if (!match || v.verdict === "unchanged") continue;
    const nextStatus = v.verdict === "strengthened" ? "validated" : "warning";
    await tx
      .update(hypothesesTable)
      .set({ status: nextStatus, note: v.evidence })
      .where(and(eq(hypothesesTable.id, match.id), eq(hypothesesTable.thesisId, thesis.id)));
    if (match.status !== nextStatus) {
      await appendHypothesisStatusEvent(tx, {
        thesisId: thesis.id,
        hypothesisId: match.id,
        fromStatus: match.status,
        toStatus: nextStatus,
        source: "quarterly_review",
        note: v.evidence,
      });
    }
  }
}

async function insertQuarterlyReviewRow(
  tx: KanonDb,
  thesis: ThesisDetail,
  parsed: CreateQuarterlyReviewInput,
): Promise<QuarterlyReview> {
  const now = new Date();
  const id = `qrev-${crypto.randomUUID().slice(0, 10)}`;
  const reviewFields = {
    id,
    thesisId: thesis.id,
    quarterLabel: parsed.quarterLabel,
    summary: parsed.summary,
    hypothesisVerdicts: parsed.hypothesisVerdicts,
    priceAtReview: thesis.currentPrice,
    baseTargetAtReview: thesis.valuation.base.targetPrice,
  };
  await tx.insert(quarterlyReviewsTable).values({ ...reviewFields, createdAt: now });
  // @kanon-tenant-checked: createQuarterlyReview verified assertThesisAccess(..., "write") in tx
  await tx
    .update(thesesTable)
    .set({ lastReviewedLabel: `${parsed.quarterLabel} · 季度复盘`, updatedAt: now })
    .where(eq(thesesTable.id, thesis.id));
  return { ...reviewFields, createdAt: now.toISOString() };
}

export async function createQuarterlyReview(
  db: KanonDb,
  thesisId: string,
  rawInput: CreateQuarterlyReviewInput,
  userId?: string,
): Promise<{ thesis: ThesisDetail; review: QuarterlyReview } | null> {
  const parsed = CreateQuarterlyReviewSchema.parse(rawInput);
  return runInTransaction(db, async (tx) => {
    if (userId && !(await assertThesisAccess(tx, thesisId, userId, "write"))) {
      return null;
    }
    const existing = await getThesisById(tx, thesisId);
    if (!existing) return null;
    if (parsed.applyStatusUpdates) {
      await applyVerdictStatuses(tx, existing, parsed.hypothesisVerdicts);
    }
    const review = await insertQuarterlyReviewRow(tx, existing, parsed);
    const updated = await getThesisById(tx, thesisId);
    if (!updated) return null;
    await recordThesisRevision(
      tx,
      updated,
      "quarterly_review",
      `完成 ${parsed.quarterLabel} 季度财报复盘：${parsed.summary.slice(0, 48)}`,
    );
    return { thesis: updated, review };
  });
}

export { listInboundCrossChecks } from "./thesis/inbound-cross-checks";
