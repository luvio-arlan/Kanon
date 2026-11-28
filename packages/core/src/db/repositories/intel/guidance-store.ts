import crypto from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type { GuidanceCommitment, GuidanceInput } from "../../../contracts/intel";
import { scoreGuidanceOutcome } from "../../../math/guidance";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import { guidanceCommitmentsTable } from "../../schema";
import {
  GuidancePolicyError,
  insertAiGuidanceDrafts,
  mapGuidanceRow,
  patchGuidanceDraft,
} from "./guidance-drafts-store";

export { GuidancePolicyError, insertAiGuidanceDrafts, patchGuidanceDraft };

type GuidanceRow = typeof guidanceCommitmentsTable.$inferSelect;

const byIdAndThesis = (id: string, thesisId: string) =>
  and(eq(guidanceCommitmentsTable.id, id), eq(guidanceCommitmentsTable.thesisId, thesisId));

export async function listGuidanceCommitments(
  db: KanonDb,
  thesisId: string,
): Promise<GuidanceCommitment[]> {
  const rows = await db
    .select()
    .from(guidanceCommitmentsTable)
    .where(eq(guidanceCommitmentsTable.thesisId, thesisId))
    .orderBy(desc(guidanceCommitmentsTable.issuedOn), desc(guidanceCommitmentsTable.createdAt))
    .limit(400);
  return rows.map(mapGuidanceRow);
}

export async function createGuidanceDraft(
  db: KanonDb,
  params: { thesisId: string; securityId?: string | null; createdBy: string; input: GuidanceInput },
): Promise<GuidanceCommitment> {
  const src = params.input.source;
  const sourceRef =
    src.kind === "filing_chunk" ? src.chunkId : src.kind === "research_note" ? src.noteId : null;
  const [inserted] = await db
    .insert(guidanceCommitmentsTable)
    .values({
      id: `gc_${crypto.randomUUID()}`,
      thesisId: params.thesisId,
      securityId: params.securityId ?? null,
      createdBy: params.createdBy,
      metric: params.input.metric,
      customLabel: params.input.customLabel ?? null,
      basis: params.input.basis,
      unit: params.input.unit,
      currency: "USD",
      targetFiscalYear: params.input.targetFiscalYear,
      targetFiscalPeriod: params.input.targetFiscalPeriod,
      issuedOn: params.input.issuedOn,
      low: params.input.low,
      high: params.input.high,
      sourceKind: src.kind,
      sourceRef,
      sourceUrl: src.kind === "manual" ? src.url : null,
      quote: src.quote,
      status: "draft_legacy",
    })
    .returning();
  if (!inserted) throw new GuidancePolicyError("INSERT_FAILED", "指引草稿写入失败。", 500);
  return mapGuidanceRow(inserted);
}

async function supersedePriorConfirmed(tx: KanonDb, cur: GuidanceRow): Promise<string | null> {
  if (cur.targetFiscalYear === null || !cur.targetFiscalPeriod) return null;
  const prior = await tx
    .select({ id: guidanceCommitmentsTable.id })
    .from(guidanceCommitmentsTable)
    .where(
      and(
        eq(guidanceCommitmentsTable.thesisId, cur.thesisId),
        eq(guidanceCommitmentsTable.metric, cur.metric),
        eq(guidanceCommitmentsTable.targetFiscalYear, cur.targetFiscalYear),
        eq(guidanceCommitmentsTable.targetFiscalPeriod, cur.targetFiscalPeriod),
        eq(guidanceCommitmentsTable.status, "confirmed"),
      ),
    )
    .orderBy(asc(guidanceCommitmentsTable.issuedOn));
  const latest = prior[prior.length - 1];
  if (!latest) return null;
  await tx
    .update(guidanceCommitmentsTable)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(byIdAndThesis(latest.id, cur.thesisId));
  return latest.id;
}

function assertConfirmableDraft(
  cur: GuidanceRow | undefined,
  expectedUpdatedAt?: string,
): asserts cur is GuidanceRow {
  if (!cur) throw new GuidancePolicyError("NOT_FOUND", "指引条目不存在。", 404);
  if (expectedUpdatedAt && cur.updatedAt.toISOString() !== expectedUpdatedAt) {
    throw new GuidancePolicyError("CONFLICT", "指引条目已被他人更新，请刷新后确认。", 409);
  }
  if (cur.status !== "draft_ai" && cur.status !== "draft_legacy") {
    throw new GuidancePolicyError("ALREADY_CONFIRMED", "该指引已确认或已撤回。", 409);
  }
  const basisRequired =
    cur.metric === "diluted_eps" ||
    cur.metric === "gross_margin" ||
    cur.metric === "operating_margin";
  if (basisRequired && cur.basis === "unspecified") {
    throw new GuidancePolicyError(
      "BASIS_REQUIRED",
      "确认 EPS 或利润率指引前必须明确 GAAP / Non-GAAP 口径。",
      422,
    );
  }
  const missingFields =
    !cur.unit ||
    cur.targetFiscalYear === null ||
    !cur.targetFiscalPeriod ||
    (cur.low === null && cur.high === null) ||
    cur.quote.length < 12;
  if (missingFields) {
    throw new GuidancePolicyError("INCOMPLETE_DRAFT", "确认前必须补齐期间、单位、区间与原文摘录。");
  }
}

/** Sole HITL entry point allowed to transition a guidance commitment to `confirmed` (enforced by G17). */
export async function confirmGuidanceCommitment(
  db: KanonDb,
  params: { id: string; thesisId: string; confirmedBy: string; expectedUpdatedAt?: string },
): Promise<GuidanceCommitment> {
  return runInTransaction(db, async (tx) => {
    const [cur] = await tx
      .select()
      .from(guidanceCommitmentsTable)
      .where(byIdAndThesis(params.id, params.thesisId))
      .limit(1);
    assertConfirmableDraft(cur, params.expectedUpdatedAt);
    const supersedesId = await supersedePriorConfirmed(tx, cur);
    const [updated] = await tx
      .update(guidanceCommitmentsTable)
      .set({
        status: "confirmed",
        confirmedBy: params.confirmedBy,
        confirmedAt: new Date(),
        supersedesId,
        updatedAt: new Date(),
      })
      .where(byIdAndThesis(params.id, params.thesisId))
      .returning();
    if (!updated) throw new GuidancePolicyError("CONFIRM_FAILED", "确认失败。", 500);
    return mapGuidanceRow(updated);
  });
}

export async function withdrawGuidanceCommitment(
  db: KanonDb,
  params: { id: string; thesisId: string },
): Promise<boolean> {
  const [cur] = await db
    .select({ id: guidanceCommitmentsTable.id, resolvedAt: guidanceCommitmentsTable.resolvedAt })
    .from(guidanceCommitmentsTable)
    .where(byIdAndThesis(params.id, params.thesisId))
    .limit(1);
  if (!cur) return false;
  if (cur.resolvedAt !== null) {
    throw new GuidancePolicyError("ALREADY_RESOLVED", "已兑现的指引记录已冻结，不可撤回。", 409);
  }
  const res = await db
    .update(guidanceCommitmentsTable)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(byIdAndThesis(params.id, params.thesisId))
    .returning();
  return res.length > 0;
}

export async function recordManualGuidanceActual(
  db: KanonDb,
  params: {
    id: string;
    thesisId: string;
    actualValue: number;
    source: { url: string; quote: string };
  },
): Promise<GuidanceCommitment> {
  const [cur] = await db
    .select()
    .from(guidanceCommitmentsTable)
    .where(byIdAndThesis(params.id, params.thesisId))
    .limit(1);
  if (!cur) throw new GuidancePolicyError("NOT_FOUND", "指引条目不存在。", 404);
  if (cur.status !== "confirmed" || !cur.unit) {
    throw new GuidancePolicyError("NOT_CONFIRMED", "仅已确认的指引可录入实际结果。", 409);
  }
  const scored = scoreGuidanceOutcome({
    metric: cur.metric,
    unit: cur.unit,
    low: cur.low,
    high: cur.high,
    actual: params.actualValue,
  });
  const [updated] = await db
    .update(guidanceCommitmentsTable)
    .set({
      actualValue: params.actualValue,
      actualSourceJson: { kind: "manual", url: params.source.url, quote: params.source.quote },
      outcome: scored.outcome,
      surprise: scored.surprise,
      resolvedAt: new Date(),
      resolutionVersion: "manual/1",
      updatedAt: new Date(),
    })
    .where(byIdAndThesis(params.id, params.thesisId))
    .returning();
  if (!updated) throw new GuidancePolicyError("RESOLVE_FAILED", "录入实际值失败。", 500);
  return mapGuidanceRow(updated);
}
