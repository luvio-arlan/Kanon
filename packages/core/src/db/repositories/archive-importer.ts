import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import {
  type ThesisArchiveImportRequest,
  ThesisArchiveImportRequestSchema,
} from "../../contracts/api-contracts";
import { DEFAULT_WORKSPACE_USER_ID } from "../../contracts/auth-contracts";
import type { ThesisDetail } from "../../schemas/research";
import { type KanonDb, runInTransaction } from "../client";
import {
  crossChecksTable,
  disciplineEntriesTable,
  hypothesesTable,
  thesesTable,
  valuationScenariosTable,
} from "../schema";
import { upsertSecSnapshot } from "./discipline-mutations";
import { recordThesisRevision } from "./revision-queries";
import { getThesisById } from "./thesis-queries";

async function replaceChildRows(tx: KanonDb, targetId: string, source: ThesisDetail) {
  await tx.delete(hypothesesTable).where(eq(hypothesesTable.thesisId, targetId));
  await tx.insert(hypothesesTable).values(
    source.hypotheses.map((h, idx) => ({
      ...h,
      id: `${targetId}-h-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
      thesisId: targetId,
      sortOrder: idx,
    })),
  );
  await tx.delete(crossChecksTable).where(eq(crossChecksTable.thesisId, targetId));
  if (source.crossChecks.length > 0) {
    await tx.insert(crossChecksTable).values(
      source.crossChecks.map((cc, idx) => ({
        ...cc,
        id: `${targetId}-cc-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
        thesisId: targetId,
        linkedThesisId: cc.linkedThesisId ?? null,
      })),
    );
  }
  await tx.delete(disciplineEntriesTable).where(eq(disciplineEntriesTable.thesisId, targetId));
  if (source.disciplineEntries.length > 0) {
    await tx.insert(disciplineEntriesTable).values(
      source.disciplineEntries.map((d, idx) => ({
        ...d,
        id: `${targetId}-disc-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
        thesisId: targetId,
        createdAt: new Date(d.createdAt),
      })),
    );
  }
}

async function upsertValuationFromSource(tx: KanonDb, targetId: string, source: ThesisDetail) {
  const v = source.valuationInput;
  const payload = {
    bearEps: v.bear.eps,
    bearPe: v.bear.peMultiple,
    bearProb: v.bear.probability ?? 0.25,
    baseEps: v.base.eps,
    basePe: v.base.peMultiple,
    baseProb: v.base.probability ?? 0.5,
    bullEps: v.bull.eps,
    bullPe: v.bull.peMultiple,
    bullProb: v.bull.probability ?? 0.25,
    modelMode: source.valuationModelMode,
    driverInputs: source.valuationDriverInputs,
    priceHistory: source.priceHistory,
  };
  await tx
    .insert(valuationScenariosTable)
    .values({ thesisId: targetId, ...payload })
    .onConflictDoUpdate({ target: valuationScenariosTable.thesisId, set: payload });
}

async function resolveTargetRow(
  tx: KanonDb,
  userId: string,
  source: ThesisDetail,
  mode: "create_copy" | "overwrite",
  now: Date,
): Promise<{ targetId: string; appliedMode: "create_copy" | "overwrite" }> {
  const existingRows = await tx
    .select({ id: thesesTable.id, ticker: thesesTable.ticker, indexOrder: thesesTable.indexOrder })
    .from(thesesTable)
    .where(eq(thesesTable.userId, userId));
  const tickerUpper = source.ticker.trim().toUpperCase();
  const match = existingRows.find((r) => r.ticker.toUpperCase() === tickerUpper);
  const coreFields = {
    ticker: tickerUpper,
    companyName: source.companyName,
    sectorTag: source.sectorTag,
    currentPrice: source.currentPrice,
    horizonYears: source.horizonYears,
    portfolioRole: source.portfolioRole,
    currentWeightPct: source.currentWeightPct,
    targetMaxWeightPct: source.targetMaxWeightPct,
    avgCostBasis: source.avgCostBasis,
    convictionSummary: source.convictionSummary,
    status: source.status,
    businessFilter: source.businessFilter,
    lastReviewedLabel: "刚刚导入 · JSON 备份还原",
    updatedAt: now,
  };

  if (mode === "overwrite" && match) {
    await tx.update(thesesTable).set(coreFields).where(eq(thesesTable.id, match.id));
    return { targetId: match.id, appliedMode: "overwrite" };
  }
  const nextOrder = existingRows.reduce((max, r) => Math.max(max, r.indexOrder), 0) + 1;
  const slug = tickerUpper.toLowerCase().replace(/[^a-z0-9]/g, "") || "ticker";
  const targetId = `thesis-${slug}-${crypto.randomUUID().slice(0, 6)}`;
  await tx
    .insert(thesesTable)
    .values({ id: targetId, userId, indexOrder: nextOrder, ...coreFields });
  return { targetId, appliedMode: "create_copy" };
}

export async function importThesisArchive(
  db: KanonDb,
  rawInput: ThesisArchiveImportRequest,
  userId: string = DEFAULT_WORKSPACE_USER_ID,
): Promise<{ thesis: ThesisDetail; mode: "create_copy" | "overwrite" }> {
  const parsed = ThesisArchiveImportRequestSchema.parse(rawInput);
  const source = parsed.archive.thesis;

  const result = await runInTransaction(db, async (tx) => {
    const now = new Date();
    const { targetId, appliedMode } = await resolveTargetRow(tx, userId, source, parsed.mode, now);
    await replaceChildRows(tx, targetId, source);
    await upsertValuationFromSource(tx, targetId, source);
    const hydrated = await getThesisById(tx, targetId, userId);
    if (!hydrated) throw new Error("Imported thesis hydration failed");
    await recordThesisRevision(
      tx,
      hydrated,
      "create",
      `从 JSON 备份${appliedMode === "overwrite" ? "覆盖还原" : "导入新建"} ${hydrated.companyName} (${hydrated.ticker})`,
    );
    return { thesis: hydrated, mode: appliedMode };
  });

  if (parsed.archive.secSnapshot) {
    await upsertSecSnapshot(db, parsed.archive.secSnapshot);
  }
  return result;
}
