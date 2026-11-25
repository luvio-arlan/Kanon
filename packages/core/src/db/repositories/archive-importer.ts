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
  thesisCatalystsTable,
  valuationScenariosTable,
} from "../schema";
import { recordThesisRevision } from "./revision-queries";
import { restoreArchiveExtras, safeImportDate } from "./thesis/archive-extras-restorer";
import { getThesisById } from "./thesis-queries";

export class ArchiveTickerConflictError extends Error {
  readonly ticker: string;
  constructor(ticker: string) {
    super(`研究库中已存在代码为 ${ticker} 的标的，请改用「覆盖还原」模式。`);
    this.name = "ArchiveTickerConflictError";
    this.ticker = ticker;
  }
}

async function replaceDisciplineEntries(tx: KanonDb, targetId: string, source: ThesisDetail) {
  await tx.delete(disciplineEntriesTable).where(eq(disciplineEntriesTable.thesisId, targetId));
  if (source.disciplineEntries.length === 0) return;
  await tx.insert(disciplineEntriesTable).values(
    source.disciplineEntries.map((d, idx) => ({
      ...d,
      id: `${targetId}-disc-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
      thesisId: targetId,
      createdAt: safeImportDate(d.createdAt),
    })),
  );
}

async function replacePrimaryChildren(
  tx: KanonDb,
  targetId: string,
  source: ThesisDetail,
): Promise<Map<string, string>> {
  await tx.delete(hypothesesTable).where(eq(hypothesesTable.thesisId, targetId));
  const hypRows = source.hypotheses.map((h, idx) => ({
    oldId: h.id,
    row: {
      ...h,
      id: `${targetId}-h-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
      thesisId: targetId,
      sortOrder: idx,
    },
  }));
  const hypIdMap = new Map(hypRows.map((entry) => [entry.oldId, entry.row.id]));
  await tx.insert(hypothesesTable).values(hypRows.map((entry) => entry.row));
  await tx.delete(thesisCatalystsTable).where(eq(thesisCatalystsTable.thesisId, targetId));
  if (source.catalysts.length > 0) {
    await tx.insert(thesisCatalystsTable).values(
      source.catalysts.map((c, idx) => ({
        ...c,
        id: `${targetId}-cat-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
        thesisId: targetId,
      })),
    );
  }
  await tx.delete(crossChecksTable).where(eq(crossChecksTable.thesisId, targetId));
  if (source.crossChecks.length > 0) {
    await tx.insert(crossChecksTable).values(
      source.crossChecks.map((cc, idx) => ({
        ...cc,
        id: `${targetId}-cc-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
        thesisId: targetId,
        linkedThesisId: cc.linkedThesisId ?? null,
        hypothesisId: cc.hypothesisId ? (hypIdMap.get(cc.hypothesisId) ?? null) : null,
      })),
    );
  }
  await replaceDisciplineEntries(tx, targetId, source);
  return hypIdMap;
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
  if (match) throw new ArchiveTickerConflictError(tickerUpper);
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

  return runInTransaction(db, async (tx) => {
    const now = new Date();
    const { targetId, appliedMode } = await resolveTargetRow(tx, userId, source, parsed.mode, now);
    const hypIdMap = await replacePrimaryChildren(tx, targetId, source);
    await upsertValuationFromSource(tx, targetId, source);
    await restoreArchiveExtras({
      tx,
      targetId,
      userId,
      archive: parsed.archive,
      hypIdMap,
      clearExisting: appliedMode === "overwrite",
    });
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
}
