import crypto from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { DEFAULT_WORKSPACE_USER_ID } from "../../../contracts/auth-contracts";
import { calculateValuationScenarios, roundTo } from "../../../math/valuation-scenarios";
import type { ThesisDetail, ThesisSummary } from "../../../schemas/research";
import { type KanonDb, runInTransaction } from "../../client";
import { thesesTable, valuationScenariosTable } from "../../schema";
import { recordThesisRevision } from "../revision-queries";
import { buildValuationInput, hydrateWithChildren, loadThesisChildren } from "../thesis-queries";

export function resolveSafeChildId(
  rawId: string,
  thesisId: string,
  prefix: string,
  ownedIds: ReadonlySet<string>,
  usedIds: Set<string>,
): string {
  const keep =
    rawId.length > 0 &&
    !rawId.includes("placeholder-h-") &&
    (ownedIds.has(rawId) || rawId.startsWith(`${thesisId}-`)) &&
    !usedIds.has(rawId);
  const nextId = keep ? rawId : `${thesisId}-${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  usedIds.add(nextId);
  return nextId;
}

export async function resolveAllowedLinkedIds(
  tx: KanonDb,
  userId: string | undefined,
  items: readonly { linkedThesisId?: string | null }[],
): Promise<Set<string> | null> {
  if (!userId) return null;
  const ids = [
    ...new Set(items.map((i) => i.linkedThesisId).filter((v): v is string => Boolean(v))),
  ];
  if (ids.length === 0) return new Set();
  const rows = await tx
    .select({ id: thesesTable.id })
    .from(thesesTable)
    .where(and(eq(thesesTable.userId, userId), inArray(thesesTable.id, ids)));
  return new Set(rows.map((r) => r.id));
}

export async function assertThesisOwnership(
  db: KanonDb,
  id: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: thesesTable.id })
    .from(thesesTable)
    .where(and(eq(thesesTable.id, id), eq(thesesTable.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** Lightweight owner-scoped identity lookup for page metadata (no child hydration). */
export async function getThesisIdentity(
  db: KanonDb,
  id: string,
  userId: string,
): Promise<{ ticker: string; companyName: string } | null> {
  const [row] = await db
    .select({ ticker: thesesTable.ticker, companyName: thesesTable.companyName })
    .from(thesesTable)
    .where(and(eq(thesesTable.id, id), eq(thesesTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getThesisByTicker(
  db: KanonDb,
  ticker: string,
  userId: string,
): Promise<ThesisDetail | null> {
  const upper = ticker.trim().toUpperCase();
  const [row] = await db
    .select()
    .from(thesesTable)
    .where(and(eq(thesesTable.userId, userId), eq(thesesTable.ticker, upper)))
    .limit(1);
  if (!row) return null;
  const children = await loadThesisChildren(db, [row.id]);
  return hydrateWithChildren(row, children);
}

export async function listThesisSummaries(
  db: KanonDb,
  userId: string = DEFAULT_WORKSPACE_USER_ID,
): Promise<ThesisSummary[]> {
  const rows = await db
    .select()
    .from(thesesTable)
    .where(eq(thesesTable.userId, userId))
    .orderBy(asc(thesesTable.indexOrder));
  if (rows.length === 0) return [];
  const vals = await db
    .select()
    .from(valuationScenariosTable)
    .where(
      inArray(
        valuationScenariosTable.thesisId,
        rows.map((r) => r.id),
      ),
    );
  const valMap = new Map(vals.map((v) => [v.thesisId, v]));
  return rows.map((row) => {
    const { input, issues } = buildValuationInput(row, valMap.get(row.id));
    const val = issues ? null : calculateValuationScenarios(input);
    return {
      id: row.id,
      indexLabel: String(row.indexOrder).padStart(2, "0"),
      ticker: row.ticker,
      companyName: row.companyName,
      sectorTag: row.sectorTag,
      status: row.status,
      baseTargetPrice: val?.base.targetPrice ?? 0,
      riskRewardRatio: val?.riskRewardRatio ?? null,
    };
  });
}

async function applyAnchorWritesInTx(
  tx: KanonDb,
  userId: string,
  updates: ReadonlyArray<{ thesisId: string; currentPrice: number; label: string }>,
  now: Date,
) {
  const ids = updates.map((u) => u.thesisId);
  const valRows = await tx
    .select({
      thesisId: valuationScenariosTable.thesisId,
      priceHistory: valuationScenariosTable.priceHistory,
    })
    .from(valuationScenariosTable)
    .where(inArray(valuationScenariosTable.thesisId, ids));
  const histMap = new Map(valRows.map((v) => [v.thesisId, v.priceHistory]));
  for (const item of updates) {
    const price = roundTo(item.currentPrice, 2);
    await tx
      .update(thesesTable)
      .set({ currentPrice: price, lastReviewedLabel: "刚刚校准 · 现价锚点", updatedAt: now })
      .where(and(eq(thesesTable.id, item.thesisId), eq(thesesTable.userId, userId)));
    const history = histMap.get(item.thesisId);
    if (history && history.length > 0) {
      const nextHistory = history.map((pt, idx, arr) =>
        idx === arr.length - 1 ? { label: item.label, price } : pt,
      );
      await tx
        .update(valuationScenariosTable)
        .set({ priceHistory: nextHistory })
        .where(eq(valuationScenariosTable.thesisId, item.thesisId));
    }
  }
}

export async function batchUpdatePriceAnchors(
  db: KanonDb,
  userId: string,
  updates: ReadonlyArray<{ thesisId: string; currentPrice: number; label: string }>,
): Promise<Map<string, ThesisDetail>> {
  if (updates.length === 0) return new Map();
  const now = new Date();
  const ids = updates.map((u) => u.thesisId);
  return runInTransaction(db, async (tx) => {
    await applyAnchorWritesInTx(tx, userId, updates, now);
    const [rows, children] = await Promise.all([
      tx
        .select()
        .from(thesesTable)
        .where(and(eq(thesesTable.userId, userId), inArray(thesesTable.id, ids))),
      loadThesisChildren(tx, ids),
    ]);
    const hydratedMap = new Map<string, ThesisDetail>();
    for (const row of rows) {
      const detail = hydrateWithChildren(row, children);
      hydratedMap.set(row.id, detail);
      await recordThesisRevision(
        tx,
        detail,
        "price_anchor",
        `快速校准当前参考价至 $${detail.currentPrice.toFixed(2)}`,
      );
    }
    return hydratedMap;
  });
}

export interface ValuationScalarRow {
  thesisId: string;
  bearEps: number;
  bearPe: number;
  bearProb: number;
  baseEps: number;
  basePe: number;
  baseProb: number;
  bullEps: number;
  bullPe: number;
  bullProb: number;
}

export function fetchSiblingValuations(
  db: KanonDb,
  otherIds: readonly string[],
): Promise<ValuationScalarRow[]> {
  if (otherIds.length === 0) return Promise.resolve([]);
  const v = valuationScenariosTable;
  return db
    .select({
      thesisId: v.thesisId,
      bearEps: v.bearEps,
      bearPe: v.bearPe,
      bearProb: v.bearProb,
      baseEps: v.baseEps,
      basePe: v.basePe,
      baseProb: v.baseProb,
      bullEps: v.bullEps,
      bullPe: v.bullPe,
      bullProb: v.bullProb,
    })
    .from(v)
    .where(inArray(v.thesisId, [...otherIds]));
}

export async function listThesisWatchersByTicker(
  db: KanonDb,
  ticker: string,
): Promise<Array<{ userId: string; thesisId: string }>> {
  const upper = ticker.trim().toUpperCase();
  return db
    .select({ userId: thesesTable.userId, thesisId: thesesTable.id })
    .from(thesesTable)
    .where(eq(thesesTable.ticker, upper));
}
