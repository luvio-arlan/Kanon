import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { calculateResearchReadiness } from "../math/research-readiness";
import type { RevisionStep, ThesisDetail, ThesisRevision } from "../schemas/research";
import type { KanonDb } from "./client";
import { thesisRevisionsTable } from "./schema";

export async function recordThesisRevision(
  db: KanonDb,
  thesis: ThesisDetail,
  step: RevisionStep,
  summary: string,
): Promise<ThesisRevision> {
  const now = new Date();
  const id = `rev-${crypto.randomUUID().slice(0, 10)}`;
  const readiness = calculateResearchReadiness(thesis);

  await db.insert(thesisRevisionsTable).values({
    id,
    thesisId: thesis.id,
    step,
    summary,
    currentPrice: thesis.currentPrice,
    baseTargetPrice: thesis.valuation.base.targetPrice,
    riskRewardRatio: thesis.valuation.riskRewardRatio,
    readinessScore: readiness.scorePct,
    createdAt: now,
  });

  return {
    id,
    thesisId: thesis.id,
    step,
    summary,
    currentPrice: thesis.currentPrice,
    baseTargetPrice: thesis.valuation.base.targetPrice,
    riskRewardRatio: thesis.valuation.riskRewardRatio,
    readinessScore: readiness.scorePct,
    createdAt: now.toISOString(),
  };
}

export async function listThesisRevisions(
  db: KanonDb,
  thesisId: string,
  limit = 20,
): Promise<ThesisRevision[]> {
  const rows = await db
    .select()
    .from(thesisRevisionsTable)
    .where(eq(thesisRevisionsTable.thesisId, thesisId))
    .orderBy(desc(thesisRevisionsTable.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    thesisId: row.thesisId,
    step: row.step,
    summary: row.summary,
    currentPrice: row.currentPrice,
    baseTargetPrice: row.baseTargetPrice,
    riskRewardRatio: row.riskRewardRatio ?? null,
    readinessScore: row.readinessScore,
    createdAt: row.createdAt.toISOString(),
  }));
}
