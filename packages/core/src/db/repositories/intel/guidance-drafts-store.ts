import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import type {
  GuidanceCommitment,
  GuidanceDraft,
  GuidancePatchRequest,
} from "../../../contracts/intel";
import type { KanonDb } from "../../bootstrap";
import { guidanceCommitmentsTable } from "../../schema";

export class GuidancePolicyError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "GuidancePolicyError";
    this.code = code;
    this.status = status;
  }
}

export function mapGuidanceRow(
  r: typeof guidanceCommitmentsTable.$inferSelect,
): GuidanceCommitment {
  const actualRestated = Boolean(r.actualSourceJson?.restated);
  return {
    id: r.id,
    thesisId: r.thesisId,
    securityId: r.securityId,
    createdBy: r.createdBy,
    metric: r.metric,
    customLabel: r.customLabel,
    basis: r.basis,
    unit: r.unit,
    currency: r.currency,
    targetFiscalYear: r.targetFiscalYear,
    targetFiscalPeriod: r.targetFiscalPeriod,
    targetPeriodEnd: r.targetPeriodEnd,
    issuedOn: r.issuedOn,
    low: r.low,
    high: r.high,
    sourceKind: r.sourceKind,
    sourceRef: r.sourceRef,
    sourceUrl: r.sourceUrl,
    quote: r.quote,
    status: r.status,
    supersedesId: r.supersedesId,
    confirmedBy: r.confirmedBy,
    confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
    actualValue: r.actualValue,
    actualRestated,
    outcome: r.outcome,
    surprise: r.surprise,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function insertAiGuidanceDrafts(
  db: KanonDb,
  params: {
    thesisId: string;
    securityId?: string | null;
    createdBy: string;
    noteId: string;
    issuedOn: string;
    model: string;
    promptVersion: string;
    drafts: readonly GuidanceDraft[];
  },
): Promise<GuidanceCommitment[]> {
  const created: GuidanceCommitment[] = [];
  for (const d of params.drafts) {
    const [row] = await db
      .insert(guidanceCommitmentsTable)
      .values({
        id: `gc_ai_${crypto.randomUUID()}`,
        thesisId: params.thesisId,
        securityId: params.securityId ?? null,
        createdBy: params.createdBy,
        metric: d.metric,
        customLabel: d.customLabel ?? null,
        basis: d.basis,
        unit: d.unit ?? null,
        currency: "USD",
        targetFiscalYear: d.targetFiscalYear ?? null,
        targetFiscalPeriod: d.targetFiscalPeriod ?? null,
        issuedOn: params.issuedOn,
        low: d.low ?? null,
        high: d.high ?? null,
        sourceKind: "research_note",
        sourceRef: params.noteId,
        quote: d.quote,
        status: "draft_ai",
        extractionJson: { model: params.model, promptVersion: params.promptVersion },
      })
      .returning();
    if (row) created.push(mapGuidanceRow(row));
  }
  return created;
}

function buildDraftPatchFields(patch: GuidancePatchRequest) {
  const fields: Partial<typeof guidanceCommitmentsTable.$inferInsert> = { updatedAt: new Date() };
  if (patch.metric) fields.metric = patch.metric;
  if (patch.customLabel !== undefined) fields.customLabel = patch.customLabel;
  if (patch.basis) fields.basis = patch.basis;
  if (patch.unit) fields.unit = patch.unit;
  if (patch.targetFiscalYear !== undefined) fields.targetFiscalYear = patch.targetFiscalYear;
  if (patch.targetFiscalPeriod !== undefined) fields.targetFiscalPeriod = patch.targetFiscalPeriod;
  if (patch.low !== undefined) fields.low = patch.low;
  if (patch.high !== undefined) fields.high = patch.high;
  if (patch.quote) fields.quote = patch.quote;
  return fields;
}

export async function patchGuidanceDraft(
  db: KanonDb,
  thesisId: string,
  patch: GuidancePatchRequest,
): Promise<GuidanceCommitment> {
  const [cur] = await db
    .select()
    .from(guidanceCommitmentsTable)
    .where(
      and(
        eq(guidanceCommitmentsTable.id, patch.id),
        eq(guidanceCommitmentsTable.thesisId, thesisId),
      ),
    )
    .limit(1);
  if (!cur) throw new GuidancePolicyError("NOT_FOUND", "指引条目不存在。", 404);
  if (cur.status !== "draft_ai" && cur.status !== "draft_legacy") {
    throw new GuidancePolicyError(
      "IMMUTABLE_CONFIRMED",
      "已确认指引不可编辑，仅可撤回或新增取代条目。",
      409,
    );
  }
  const [updated] = await db
    .update(guidanceCommitmentsTable)
    .set(buildDraftPatchFields(patch))
    .where(
      and(
        eq(guidanceCommitmentsTable.id, patch.id),
        eq(guidanceCommitmentsTable.thesisId, thesisId),
      ),
    )
    .returning();
  if (!updated) throw new GuidancePolicyError("PATCH_FAILED", "更新草稿失败。", 500);
  return mapGuidanceRow(updated);
}
