import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { calculateResearchReadiness } from "../../math/research-readiness";
import type {
  RevisionSnapshot,
  RevisionStep,
  ThesisDetail,
  ThesisRevision,
} from "../../schemas/research";
import type { KanonDb } from "../client";
import { thesisRevisionsTable } from "../schema";

function buildRevisionSnapshot(thesis: ThesisDetail, readinessScore: number): RevisionSnapshot {
  return {
    currentPrice: thesis.currentPrice,
    bearTarget: thesis.valuation.bear.targetPrice,
    baseTarget: thesis.valuation.base.targetPrice,
    bullTarget: thesis.valuation.bull.targetPrice,
    baseEps: thesis.valuation.base.eps,
    basePe: thesis.valuation.base.peMultiple,
    riskRewardRatio: thesis.valuation.riskRewardRatio,
    readinessScore,
    hypotheses: thesis.hypotheses.map((h) => ({
      title: h.title,
      status: h.status,
      threshold: h.threshold,
    })),
  };
}

export async function recordThesisRevision(
  db: KanonDb,
  thesis: ThesisDetail,
  step: RevisionStep,
  summary: string,
): Promise<ThesisRevision> {
  const now = new Date();
  const id = `rev-${crypto.randomUUID().slice(0, 10)}`;
  const readiness = calculateResearchReadiness(thesis);
  const snapshot = buildRevisionSnapshot(thesis, readiness.scorePct);

  await db.insert(thesisRevisionsTable).values({
    id,
    thesisId: thesis.id,
    step,
    summary,
    currentPrice: thesis.currentPrice,
    baseTargetPrice: thesis.valuation.base.targetPrice,
    riskRewardRatio: thesis.valuation.riskRewardRatio,
    readinessScore: readiness.scorePct,
    snapshotJson: snapshot,
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
    snapshot,
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
    snapshot: row.snapshotJson ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}
