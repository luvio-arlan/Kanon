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

function buildThesisValues(userId: string, scopedId: string, item: SeedThesisRecord) {
  return {
    id: scopedId,
    userId,
    indexOrder: item.indexOrder,
    ticker: item.ticker,
    companyName: item.companyName,
    sectorTag: item.sectorTag,
    currentPrice: item.currentPrice,
    horizonYears: item.horizonYears,
    portfolioRole: item.portfolioRole ?? ("watchlist" as const),
    currentWeightPct: item.currentWeightPct ?? 0,
    targetMaxWeightPct: item.targetMaxWeightPct ?? 15,
    avgCostBasis: item.avgCostBasis ?? null,
    convictionSummary: item.convictionSummary,
    status: item.status,
    businessFilter: item.businessFilter,
    lastReviewedLabel: "模板预置 · 可自由编辑",
  };
}

function collectStarterChildren(userId: string, idMap: Map<string, string>) {
  const hypotheses: (typeof hypothesesTable.$inferInsert)[] = [];
  const crossChecks: (typeof crossChecksTable.$inferInsert)[] = [];
  const valuations: (typeof valuationScenariosTable.$inferInsert)[] = [];
  const disciplines: (typeof disciplineEntriesTable.$inferInsert)[] = [];

  for (const item of SEED_THESIS_RECORDS) {
    const scopedId = idMap.get(item.id) ?? buildUserScopedId(userId, item.id);
    for (let idx = 0; idx < item.hypotheses.length; idx += 1) {
      const h = item.hypotheses[idx];
      if (!h) continue;
      hypotheses.push({
        ...h,
        id: buildUserScopedId(userId, h.id),
        thesisId: scopedId,
        sortOrder: idx,
      });
    }
    for (const cc of item.crossChecks) {
      crossChecks.push({
        ...cc,
        id: buildUserScopedId(userId, cc.id),
        thesisId: scopedId,
        linkedThesisId: mapLinkedId(cc.linkedThesisId, idMap),
      });
    }
    valuations.push({ thesisId: scopedId, ...item.valuationInput });
    for (const entry of item.disciplineEntries) {
      disciplines.push({
        ...entry,
        id: buildUserScopedId(userId, entry.id),
        thesisId: scopedId,
      });
    }
  }
  return { hypotheses, crossChecks, valuations, disciplines };
}

export async function provisionStarterWorkspaceForUser(tx: KanonDb, userId: string): Promise<void> {
  const existing = await tx
    .select({ id: thesesTable.id })
    .from(thesesTable)
    .where(eq(thesesTable.userId, userId))
    .limit(1);
  if (existing.length > 0) return;

  const idMap = new Map(
    SEED_THESIS_RECORDS.map((item) => [item.id, buildUserScopedId(userId, item.id)]),
  );
  const thesisRows = SEED_THESIS_RECORDS.map((item) =>
    buildThesisValues(userId, idMap.get(item.id) ?? buildUserScopedId(userId, item.id), item),
  );
  const children = collectStarterChildren(userId, idMap);

  await tx.insert(thesesTable).values(thesisRows).onConflictDoNothing();
  await Promise.all([
    children.hypotheses.length > 0
      ? tx.insert(hypothesesTable).values(children.hypotheses).onConflictDoNothing()
      : Promise.resolve(),
    children.crossChecks.length > 0
      ? tx.insert(crossChecksTable).values(children.crossChecks).onConflictDoNothing()
      : Promise.resolve(),
    children.valuations.length > 0
      ? tx.insert(valuationScenariosTable).values(children.valuations).onConflictDoNothing()
      : Promise.resolve(),
    children.disciplines.length > 0
      ? tx.insert(disciplineEntriesTable).values(children.disciplines).onConflictDoNothing()
      : Promise.resolve(),
  ]);
}
