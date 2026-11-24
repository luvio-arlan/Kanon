import { eq } from "drizzle-orm";
import type { KanonDb } from "../client";
import {
  crossChecksTable,
  disciplineEntriesTable,
  hypothesesTable,
  thesesTable,
  valuationScenariosTable,
} from "../schema";
import { SEED_THESIS_RECORDS } from "../seeds/seed-theses";
import type { SeedThesisRecord } from "../seeds/seed-types";

function buildUserScopedId(userId: string, baseId: string): string {
  const suffix = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "u";
  return `${baseId}-${suffix}`;
}

function mapLinkedId(
  linkedThesisId: string | null | undefined,
  idMap: Map<string, string>,
): string | null {
  if (!linkedThesisId) return null;
  return idMap.get(linkedThesisId) ?? null;
}

async function insertStarterThesisChildren(
  tx: KanonDb,
  userId: string,
  scopedId: string,
  item: SeedThesisRecord,
  idMap: Map<string, string>,
): Promise<void> {
  await tx
    .insert(hypothesesTable)
    .values(
      item.hypotheses.map((h, idx) => ({
        ...h,
        id: buildUserScopedId(userId, h.id),
        thesisId: scopedId,
        sortOrder: idx,
      })),
    )
    .onConflictDoNothing();

  await tx
    .insert(crossChecksTable)
    .values(
      item.crossChecks.map((cc) => ({
        ...cc,
        id: buildUserScopedId(userId, cc.id),
        thesisId: scopedId,
        linkedThesisId: mapLinkedId(cc.linkedThesisId, idMap),
      })),
    )
    .onConflictDoNothing();

  await tx
    .insert(valuationScenariosTable)
    .values({ thesisId: scopedId, ...item.valuationInput })
    .onConflictDoNothing();

  await tx
    .insert(disciplineEntriesTable)
    .values(
      item.disciplineEntries.map((entry) => ({
        ...entry,
        id: buildUserScopedId(userId, entry.id),
        thesisId: scopedId,
      })),
    )
    .onConflictDoNothing();
}

async function insertStarterThesisRow(
  tx: KanonDb,
  userId: string,
  scopedId: string,
  item: SeedThesisRecord,
): Promise<void> {
  await tx
    .insert(thesesTable)
    .values({
      id: scopedId,
      userId,
      indexOrder: item.indexOrder,
      ticker: item.ticker,
      companyName: item.companyName,
      sectorTag: item.sectorTag,
      currentPrice: item.currentPrice,
      horizonYears: item.horizonYears,
      portfolioRole: item.portfolioRole ?? "watchlist",
      currentWeightPct: item.currentWeightPct ?? 0,
      targetMaxWeightPct: item.targetMaxWeightPct ?? 15,
      avgCostBasis: item.avgCostBasis ?? null,
      convictionSummary: item.convictionSummary,
      status: item.status,
      businessFilter: item.businessFilter,
      lastReviewedLabel: "模板预置 · 可自由编辑",
    })
    .onConflictDoNothing();
}

export async function provisionStarterWorkspaceForUser(tx: KanonDb, userId: string): Promise<void> {
  const existing = await tx
    .select({ id: thesesTable.id })
    .from(thesesTable)
    .where(eq(thesesTable.userId, userId))
    .limit(1);
  if (existing.length > 0) return;

  const idMap = new Map<string, string>();
  for (const item of SEED_THESIS_RECORDS) {
    idMap.set(item.id, buildUserScopedId(userId, item.id));
  }

  for (const item of SEED_THESIS_RECORDS) {
    const scopedId = idMap.get(item.id) ?? buildUserScopedId(userId, item.id);
    await insertStarterThesisRow(tx, userId, scopedId, item);
    await insertStarterThesisChildren(tx, userId, scopedId, item, idMap);
  }
}
