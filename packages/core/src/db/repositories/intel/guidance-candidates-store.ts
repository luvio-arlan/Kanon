import crypto from "node:crypto";
import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import type {
  GuidanceBasis,
  GuidanceCandidate,
  GuidanceFiscalPeriod,
  GuidanceMetric,
  GuidanceUnit,
} from "../../../contracts/intel";
import type { KanonDb } from "../../bootstrap";
import { guidanceCandidatesTable, guidanceCommitmentsTable } from "../../schema";
import { getThesisIdentity } from "../thesis/thesis-lookups";
import { getSecurityByTicker } from "../warehouse/securities-and-fx-store";
import { GuidancePolicyError } from "./guidance-store";

export interface UpsertGuidanceCandidateInput {
  securityId: string;
  accession: string;
  chunkId: string;
  metric: GuidanceMetric;
  basis: GuidanceBasis;
  unit: GuidanceUnit;
  currency?: string;
  targetFiscalYear: number;
  targetFiscalPeriod: GuidanceFiscalPeriod;
  low: number | null;
  high: number | null;
  quote: string;
  extractor: "rule/1" | "llm/1";
  ruleVersion: number;
  issuedOn: string;
}

function toCandidateRow(r: UpsertGuidanceCandidateInput) {
  return {
    id: `gcand_${crypto.randomUUID()}`,
    securityId: r.securityId,
    accession: r.accession,
    chunkId: r.chunkId,
    metric: r.metric,
    basis: r.basis,
    unit: r.unit,
    currency: (r.currency ?? "USD").toUpperCase(),
    targetFiscalYear: r.targetFiscalYear,
    targetFiscalPeriod: r.targetFiscalPeriod,
    low: r.low,
    high: r.high,
    quote: r.quote.trim().slice(0, 600),
    extractor: r.extractor,
    ruleVersion: r.ruleVersion,
    issuedOn: r.issuedOn,
  };
}

/**
 * Idempotently writes public security-level 8-K Ex-99.1 guidance candidates (U1-2). A higher
 * `ruleVersion` supersedes the stored values in place and clears any retraction (V1-1).
 */
export async function upsertGuidanceCandidates(
  db: KanonDb,
  rows: readonly UpsertGuidanceCandidateInput[],
): Promise<number> {
  let written = 0;
  for (const r of rows) {
    if (r.low === null && r.high === null) continue;
    if (r.low !== null && r.high !== null && r.low > r.high) continue;
    if (r.quote.trim().length < 12) continue;
    const values = toCandidateRow(r);
    const inserted = await db
      .insert(guidanceCandidatesTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          guidanceCandidatesTable.accession,
          guidanceCandidatesTable.metric,
          guidanceCandidatesTable.targetFiscalYear,
          guidanceCandidatesTable.targetFiscalPeriod,
          guidanceCandidatesTable.basis,
        ],
        set: {
          chunkId: values.chunkId,
          low: values.low,
          high: values.high,
          quote: values.quote,
          ruleVersion: values.ruleVersion,
          retractedAt: null,
          retractReason: null,
        },
        setWhere: lt(guidanceCandidatesTable.ruleVersion, r.ruleVersion),
      })
      .returning();
    written += inserted.length;
  }
  return written;
}

/** Lists recent unadopted 8-K Ex-99.1 guidance candidates for a thesis's security (U1-2). */
export async function listUnadoptedGuidanceCandidates(
  db: KanonDb,
  thesisId: string,
  securityId: string,
): Promise<GuidanceCandidate[]> {
  const [adoptedRows, candRows] = await Promise.all([
    db
      .select({ candidateId: guidanceCommitmentsTable.candidateId })
      .from(guidanceCommitmentsTable)
      .where(
        and(
          eq(guidanceCommitmentsTable.thesisId, thesisId),
          isNotNull(guidanceCommitmentsTable.candidateId),
        ),
      ),
    db
      .select()
      .from(guidanceCandidatesTable)
      .where(
        and(
          eq(guidanceCandidatesTable.securityId, securityId),
          isNull(guidanceCandidatesTable.retractedAt),
        ),
      )
      .orderBy(desc(guidanceCandidatesTable.issuedOn))
      .limit(24),
  ]);
  const adopted = new Set(adoptedRows.map((r) => r.candidateId).filter(Boolean));
  return candRows
    .filter((c) => !adopted.has(c.id))
    .map((c) => ({
      id: c.id,
      securityId: c.securityId,
      accession: c.accession,
      chunkId: c.chunkId,
      metric: c.metric,
      basis: c.basis,
      unit: c.unit,
      currency: c.currency,
      targetFiscalYear: c.targetFiscalYear,
      targetFiscalPeriod: c.targetFiscalPeriod,
      low: c.low,
      high: c.high,
      quote: c.quote,
      extractor: c.extractor,
      ruleVersion: c.ruleVersion,
      issuedOn: c.issuedOn,
    }));
}

async function loadUnadoptedCandidateOrThrow(
  db: KanonDb,
  params: { thesisId: string; userId: string; candidateId: string },
) {
  const { thesisId, candidateId } = params;
  const [cand] = await db
    .select()
    .from(guidanceCandidatesTable)
    .where(eq(guidanceCandidatesTable.id, candidateId))
    .limit(1);
  if (!cand) {
    throw new GuidancePolicyError("CANDIDATE_NOT_FOUND", "未找到对应的 8-K 指引候选。", 404);
  }
  if (cand.retractedAt) {
    throw new GuidancePolicyError("CANDIDATE_RETRACTED", "该 8-K 指引候选已撤回。", 409);
  }
  const identity = await getThesisIdentity(db, thesisId, params.userId);
  const sec = identity ? await getSecurityByTicker(db, identity.ticker) : null;
  if (!sec || sec.id !== cand.securityId) {
    throw new GuidancePolicyError(
      "CANDIDATE_SECURITY_MISMATCH",
      "该 8-K 指引候选不属于本档案标的。",
      409,
    );
  }
  const [existing] = await db
    .select({ id: guidanceCommitmentsTable.id })
    .from(guidanceCommitmentsTable)
    .where(
      and(
        eq(guidanceCommitmentsTable.thesisId, thesisId),
        eq(guidanceCommitmentsTable.candidateId, cand.id),
      ),
    )
    .limit(1);
  if (existing) {
    throw new GuidancePolicyError("ALREADY_ADOPTED", "该 8-K 指引候选已采纳为草稿。", 409);
  }
  return cand;
}

/**
 * Adopts a public 8-K press-release candidate into the user's thesis as `draft_ai` (never `confirmed` — G17).
 * Rejects duplicate adoption for the same `(thesisId, candidateId)` with 409 `ALREADY_ADOPTED`.
 */
export async function adoptGuidanceCandidate(
  db: KanonDb,
  params: { thesisId: string; userId: string; candidateId: string },
): Promise<{ id: string }> {
  const cand = await loadUnadoptedCandidateOrThrow(db, params);
  const id = `guid_${crypto.randomUUID()}`;
  await db.insert(guidanceCommitmentsTable).values({
    id,
    thesisId: params.thesisId,
    securityId: cand.securityId,
    createdBy: params.userId,
    metric: cand.metric,
    customLabel: null,
    basis: cand.basis,
    unit: cand.unit,
    currency: cand.currency,
    targetFiscalYear: cand.targetFiscalYear,
    targetFiscalPeriod: cand.targetFiscalPeriod,
    targetPeriodEnd: null,
    issuedOn: cand.issuedOn,
    low: cand.low,
    high: cand.high,
    sourceKind: "filing_chunk",
    sourceRef: cand.chunkId,
    sourceUrl: null,
    quote: cand.quote,
    status: "draft_ai",
    supersedesId: null,
    candidateId: cand.id,
    extractionJson: { extractor: cand.extractor, accession: cand.accession },
  });
  return { id };
}
