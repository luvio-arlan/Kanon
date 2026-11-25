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

const COALESCE_WINDOW_MS = 5 * 60 * 1000;
const COALESCEABLE_STEPS = new Set<RevisionStep>([
  "business_filter",
  "hypotheses",
  "catalysts",
  "cross_checks",
  "valuation",
]);

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

function toRevisionDto(params: {
  id: string;
  thesis: ThesisDetail;
  step: RevisionStep;
  summary: string;
  readinessScore: number;
  snapshot: RevisionSnapshot;
  now: Date;
}): ThesisRevision {
  const { id, thesis, step, summary, readinessScore, snapshot, now } = params;
  return {
    id,
    thesisId: thesis.id,
    step,
    summary,
    currentPrice: thesis.currentPrice,
    baseTargetPrice: thesis.valuation.base.targetPrice,
    riskRewardRatio: thesis.valuation.riskRewardRatio,
    readinessScore,
    snapshot,
    createdAt: now.toISOString(),
  };
}

async function findRecentSameStepRevision(
  db: KanonDb,
  thesisId: string,
  step: RevisionStep,
  now: Date,
): Promise<string | null> {
  if (!COALESCEABLE_STEPS.has(step)) return null;
  const [latest] = await db
    .select({
      id: thesisRevisionsTable.id,
      step: thesisRevisionsTable.step,
      createdAt: thesisRevisionsTable.createdAt,
    })
    .from(thesisRevisionsTable)
    .where(eq(thesisRevisionsTable.thesisId, thesisId))
    .orderBy(desc(thesisRevisionsTable.createdAt))
    .limit(1);
  if (!latest || latest.step !== step) return null;
  return now.getTime() - latest.createdAt.getTime() <= COALESCE_WINDOW_MS ? latest.id : null;
}

export async function recordThesisRevision(
  db: KanonDb,
  thesis: ThesisDetail,
  step: RevisionStep,
  summary: string,
): Promise<ThesisRevision> {
  const now = new Date();
  const readiness = calculateResearchReadiness(thesis);
  const snapshot = buildRevisionSnapshot(thesis, readiness.scorePct);
  const payload = {
    summary,
    currentPrice: thesis.currentPrice,
    baseTargetPrice: thesis.valuation.base.targetPrice,
    riskRewardRatio: thesis.valuation.riskRewardRatio,
    readinessScore: readiness.scorePct,
    snapshotJson: snapshot,
    createdAt: now,
  };
  const existingId = await findRecentSameStepRevision(db, thesis.id, step, now);
  if (existingId) {
    await db
      .update(thesisRevisionsTable)
      .set(payload)
      .where(eq(thesisRevisionsTable.id, existingId));
    return toRevisionDto({
      id: existingId,
      thesis,
      step,
      summary,
      readinessScore: readiness.scorePct,
      snapshot,
      now,
    });
  }
  const id = `rev-${crypto.randomUUID().slice(0, 10)}`;
  await db.insert(thesisRevisionsTable).values({ id, thesisId: thesis.id, step, ...payload });
  return toRevisionDto({
    id,
    thesis,
    step,
    summary,
    readinessScore: readiness.scorePct,
    snapshot,
    now,
  });
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
