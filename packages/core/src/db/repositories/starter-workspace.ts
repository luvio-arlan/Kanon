import { eq } from "drizzle-orm";
import type { KanonDb } from "../client";
import {
  crossChecksTable,
  disciplineEntriesTable,
  hypothesesTable,
  thesesTable,
  thesisCatalystsTable,
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

function mapRecordChildren(
  userId: string,
  scopedId: string,
  item: SeedThesisRecord,
  idMap: Map<string, string>,
) {
  return {
    hypotheses: item.hypotheses.map((h, sortOrder) => ({
      ...h,
      id: buildUserScopedId(userId, h.id),
      thesisId: scopedId,
      sortOrder,
    })),
    catalysts: (item.catalysts ?? []).map((cat) => ({
      ...cat,
      id: buildUserScopedId(userId, cat.id),
      thesisId: scopedId,
    })),
    crossChecks: item.crossChecks.map((cc) => ({
      ...cc,
      id: buildUserScopedId(userId, cc.id),
      thesisId: scopedId,
      linkedThesisId: mapLinkedId(cc.linkedThesisId, idMap),
    })),
    valuation: { thesisId: scopedId, ...item.valuationInput },
    disciplines: item.disciplineEntries.map((entry) => ({
      ...entry,
      id: buildUserScopedId(userId, entry.id),
      thesisId: scopedId,
    })),
  };
}

function collectStarterChildren(userId: string, idMap: Map<string, string>) {
  const mapped = SEED_THESIS_RECORDS.map((item) =>
    mapRecordChildren(
      userId,
      idMap.get(item.id) ?? buildUserScopedId(userId, item.id),
      item,
      idMap,
    ),
  );
  return {
    hypotheses: mapped.flatMap((m) => m.hypotheses),
    catalysts: mapped.flatMap((m) => m.catalysts),
    crossChecks: mapped.flatMap((m) => m.crossChecks),
    valuations: mapped.map((m) => m.valuation),
    disciplines: mapped.flatMap((m) => m.disciplines),
  };
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
    children.catalysts.length > 0
      ? tx.insert(thesisCatalystsTable).values(children.catalysts).onConflictDoNothing()
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
