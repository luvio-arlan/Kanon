import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { DEFAULT_WORKSPACE_USER_ID } from "../../contracts/auth-contracts";
import {
  type CreateThesisInput,
  CreateThesisInputSchema,
  type ThesisDetail,
  type ThesisRevision,
  type UpdateThesisStepInput,
  UpdateThesisStepSchema,
} from "../../schemas/research";
import { type KanonDb, runInTransaction } from "../client";
import { hypothesesTable, thesesTable, valuationScenariosTable } from "../schema";
import { appendHypothesisStatusEvent } from "./portfolio/hypothesis-events-store";
import { listThesisRevisions, recordThesisRevision } from "./revision-queries";
import { buildThesisWriteAccessWhere } from "./thesis/thesis-access";
import {
  buildNewThesisRow,
  buildStarterHypotheses,
  buildStarterValuation,
} from "./thesis/thesis-starters";
import { getThesisById } from "./thesis-queries";
import {
  writeBusinessFilterStep,
  writeCatalystsStep,
  writeCrossChecksStep,
  writeHypothesesStep,
  writePortfolioStep,
  writePriceAnchorStep,
  writeValuationStep,
} from "./thesis-step-writers";

export async function createThesis(
  db: KanonDb,
  rawInput: CreateThesisInput,
  userId: string = DEFAULT_WORKSPACE_USER_ID,
): Promise<ThesisDetail> {
  const parsed = CreateThesisInputSchema.parse(rawInput);
  const slug = parsed.ticker.toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = `thesis-${slug}-${crypto.randomUUID().slice(0, 6)}`;

  return runInTransaction(db, async (tx) => {
    const existing = await tx
      .select({ indexOrder: thesesTable.indexOrder })
      .from(thesesTable)
      .where(eq(thesesTable.userId, userId));
    const nextOrder = existing.reduce((max, row) => Math.max(max, row.indexOrder), 0) + 1;

    await tx.insert(thesesTable).values(buildNewThesisRow(id, userId, nextOrder, parsed));
    const starterHyps = buildStarterHypotheses(id, parsed.companyName);
    await tx.insert(hypothesesTable).values(starterHyps);
    for (const h of starterHyps) {
      await appendHypothesisStatusEvent(tx, {
        thesisId: id,
        hypothesisId: h.id,
        fromStatus: null,
        toStatus: h.status,
        source: "import",
        actorUserId: userId,
        note: "建档初始假设",
      });
    }
    await tx
      .insert(valuationScenariosTable)
      .values(
        buildStarterValuation(id, parsed.currentPrice, parsed.latestSecEps, parsed.priceHistory),
      );

    const created = await getThesisById(tx, id, userId);
    if (!created) {
      throw new Error(`Failed to hydrate newly created thesis "${id}".`);
    }
    await recordThesisRevision(
      tx,
      created,
      "create",
      `建档 ${created.companyName}（${created.ticker}），初始参考价 $${created.currentPrice.toFixed(2)}`,
    );
    return created;
  });
}

async function dispatchStepWrite(
  tx: KanonDb,
  thesisId: string,
  parsed: UpdateThesisStepInput,
  now: Date,
  userId?: string,
): Promise<string> {
  if (parsed.step === "business_filter") return writeBusinessFilterStep(tx, thesisId, parsed, now);
  if (parsed.step === "hypotheses") return writeHypothesesStep(tx, thesisId, parsed, now);
  if (parsed.step === "catalysts") return writeCatalystsStep(tx, thesisId, parsed, now);
  if (parsed.step === "cross_checks") {
    return writeCrossChecksStep(tx, thesisId, parsed, now, userId);
  }
  if (parsed.step === "price_anchor") return writePriceAnchorStep(tx, thesisId, parsed, now);
  if (parsed.step === "portfolio") return writePortfolioStep(tx, thesisId, parsed, now);
  return writeValuationStep(tx, thesisId, parsed, now);
}

export type CheckedStepUpdateResult =
  | { kind: "ok"; thesis: ThesisDetail; revisions: ThesisRevision[] }
  | { kind: "not_found" }
  | { kind: "invalid_version" }
  | { kind: "conflict"; serverUpdatedAt: string };

async function verifyStepRowAccess(
  tx: KanonDb,
  thesisId: string,
  userId: string | undefined,
  expectedUpdatedAt?: string | null,
): Promise<{ ok: true } | { ok: false; result: CheckedStepUpdateResult }> {
  const whereClause = userId
    ? and(eq(thesesTable.id, thesisId), await buildThesisWriteAccessWhere(tx, userId))
    : eq(thesesTable.id, thesisId);
  const [row] = await tx
    .select({ id: thesesTable.id, updatedAt: thesesTable.updatedAt })
    .from(thesesTable)
    .where(whereClause)
    .for("update");
  if (!row) return { ok: false, result: { kind: "not_found" } };
  if (!expectedUpdatedAt) return { ok: true };
  const expectedMs = Date.parse(expectedUpdatedAt);
  if (!Number.isFinite(expectedMs)) return { ok: false, result: { kind: "invalid_version" } };
  if (Math.abs(row.updatedAt.getTime() - expectedMs) > 5) {
    return {
      ok: false,
      result: { kind: "conflict", serverUpdatedAt: row.updatedAt.toISOString() },
    };
  }
  return { ok: true };
}

export async function updateThesisStepChecked(
  db: KanonDb,
  thesisId: string,
  rawInput: UpdateThesisStepInput,
  userId?: string,
  expectedUpdatedAt?: string | null,
): Promise<CheckedStepUpdateResult> {
  const parsed = UpdateThesisStepSchema.parse(rawInput);
  const now = new Date();
  return runInTransaction(db, async (tx) => {
    const access = await verifyStepRowAccess(tx, thesisId, userId, expectedUpdatedAt);
    if (!access.ok) return access.result;
    const summary = await dispatchStepWrite(tx, thesisId, parsed, now, userId);
    const updated = await getThesisById(tx, thesisId, userId);
    if (!updated) return { kind: "not_found" };
    await recordThesisRevision(tx, updated, parsed.step, summary);
    const revisions = await listThesisRevisions(tx, thesisId);
    return { kind: "ok", thesis: updated, revisions };
  });
}

export async function updateThesisStep(
  db: KanonDb,
  thesisId: string,
  rawInput: UpdateThesisStepInput,
  userId?: string,
): Promise<ThesisDetail | null> {
  const res = await updateThesisStepChecked(db, thesisId, rawInput, userId);
  return res.kind === "ok" ? res.thesis : null;
}
