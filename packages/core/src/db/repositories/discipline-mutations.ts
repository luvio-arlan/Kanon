import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import {
  type CreateDisciplineEntryInput,
  CreateDisciplineEntrySchema,
  type GlossaryTerm,
  type SecSnapshot,
  SecSnapshotSchema,
  type ThesisDetail,
} from "../../schemas/research";
import { type KanonDb, runInTransaction } from "../client";
import {
  disciplineEntriesTable,
  glossaryTermsTable,
  secFilingsCacheTable,
  thesesTable,
} from "../schema";
import { recordThesisRevision } from "./revision-queries";
import { getThesisById } from "./thesis-queries";

const ACTION_CN: Record<CreateDisciplineEntryInput["action"], string> = {
  buy: "首次建仓",
  add: "分批加仓",
  hold: "耐心持有",
  trim: "纪律减仓",
  pass: "放弃观望",
};

function computeBuySync(existing: ThesisDetail, delta: number, priceAnchor: number) {
  const curW = Math.max(0, existing.currentWeightPct);
  const addW = Math.abs(delta);
  const nextW = Math.min(100, Math.round((curW + addW) * 10) / 10);
  const hasCurCost = curW > 0 && existing.avgCostBasis && existing.avgCostBasis > 0;
  const nextCost = hasCurCost
    ? Math.round(((curW * (existing.avgCostBasis ?? 0) + addW * priceAnchor) / nextW) * 100) / 100
    : priceAnchor;
  const needsPromotion =
    existing.portfolioRole === "watchlist" || existing.portfolioRole === "exited";
  const portfolioRole = needsPromotion
    ? nextW >= 8
      ? ("core" as const)
      : ("starter" as const)
    : existing.portfolioRole;
  return { currentWeightPct: nextW, avgCostBasis: nextCost, portfolioRole };
}

function computeSyncedPosition(
  existing: ThesisDetail,
  parsed: ReturnType<typeof CreateDisciplineEntrySchema.parse>,
) {
  const delta = parsed.weightDeltaPct;
  if (parsed.syncPosition === false || delta == null || delta === 0) return null;
  if (parsed.action === "buy" || parsed.action === "add") {
    return computeBuySync(existing, delta, parsed.priceAnchor);
  }
  if (parsed.action !== "trim") return null;
  const nextW = Math.max(
    0,
    Math.round((Math.max(0, existing.currentWeightPct) - Math.abs(delta)) * 10) / 10,
  );
  return {
    currentWeightPct: nextW,
    avgCostBasis: nextW === 0 ? null : existing.avgCostBasis,
    portfolioRole: nextW === 0 ? ("exited" as const) : existing.portfolioRole,
  };
}

export async function addDisciplineEntry(
  db: KanonDb,
  thesisId: string,
  rawInput: CreateDisciplineEntryInput,
  userId?: string,
): Promise<ThesisDetail | null> {
  const parsed = CreateDisciplineEntrySchema.parse(rawInput);
  return runInTransaction(db, async (tx) => {
    const existing = await getThesisById(tx, thesisId, userId);
    if (!existing) return null;

    await tx.insert(disciplineEntriesTable).values({
      id: `disc-${crypto.randomUUID().slice(0, 8)}`,
      thesisId,
      action: parsed.action,
      noLeverageConfirmed: parsed.noLeverageConfirmed,
      positionCapConfirmed: parsed.positionCapConfirmed,
      exitRule: parsed.exitRule,
      emotion: parsed.emotion,
      priceAnchor: parsed.priceAnchor,
      weightDeltaPct: parsed.weightDeltaPct ?? null,
      benchmarkPrice: parsed.benchmarkPrice ?? null,
      note: parsed.note,
    });
    const syncedPos = computeSyncedPosition(existing, parsed);
    await tx
      .update(thesesTable)
      .set({
        ...(syncedPos ?? {}),
        lastReviewedLabel: "刚刚复盘 · 纪律检查单",
        updatedAt: new Date(),
      })
      .where(eq(thesesTable.id, thesisId));

    const updated = await getThesisById(tx, thesisId, userId);
    if (updated) {
      await recordThesisRevision(
        tx,
        updated,
        "discipline",
        `签署「${ACTION_CN[parsed.action]}」零杠杆纪律卡（参考价 $${parsed.priceAnchor.toFixed(2)}）`,
      );
    }
    return updated;
  });
}

export async function deleteThesis(
  db: KanonDb,
  thesisId: string,
  userId?: string,
): Promise<boolean> {
  const existing = await getThesisById(db, thesisId, userId);
  if (!existing) return false;
  await db.delete(thesesTable).where(eq(thesesTable.id, thesisId));
  return true;
}

export async function upsertSecSnapshot(
  db: KanonDb,
  rawSnapshot: SecSnapshot,
): Promise<SecSnapshot> {
  const parsed = SecSnapshotSchema.parse(rawSnapshot);
  const fetchedAt = new Date(parsed.fetchedAt);
  await db
    .insert(secFilingsCacheTable)
    .values({
      ticker: parsed.ticker.toUpperCase(),
      cik: parsed.cik,
      entityName: parsed.entityName,
      source: parsed.source,
      reportingCurrency: parsed.reportingCurrency ?? "USD",
      fxToUsd: parsed.fxToUsd ?? 1,
      adrRatio: parsed.adrRatio ?? 1,
      filings: parsed.filings,
      facts: parsed.facts,
      annuals: parsed.annuals,
      quarterlies: parsed.quarterlies,
      insiderSummary: parsed.insiderSummary ?? null,
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: secFilingsCacheTable.ticker,
      set: {
        cik: parsed.cik,
        entityName: parsed.entityName,
        source: parsed.source,
        reportingCurrency: parsed.reportingCurrency ?? "USD",
        fxToUsd: parsed.fxToUsd ?? 1,
        adrRatio: parsed.adrRatio ?? 1,
        filings: parsed.filings,
        facts: parsed.facts,
        annuals: parsed.annuals,
        quarterlies: parsed.quarterlies,
        insiderSummary: parsed.insiderSummary ?? null,
        fetchedAt,
      },
    });
  return parsed;
}

const GLOSSARY_CACHE = new WeakMap<KanonDb, GlossaryTerm[]>();

export async function listGlossaryTerms(db: KanonDb): Promise<GlossaryTerm[]> {
  const cached = GLOSSARY_CACHE.get(db);
  if (cached) return [...cached];
  const rows = await db.select().from(glossaryTermsTable).orderBy(asc(glossaryTermsTable.term));
  if (rows.length > 0) {
    GLOSSARY_CACHE.set(db, rows);
  }
  return [...rows];
}

export async function getSecSnapshot(db: KanonDb, ticker: string): Promise<SecSnapshot | null> {
  const normalized = ticker.trim().toUpperCase();
  const [row] = await db
    .select()
    .from(secFilingsCacheTable)
    .where(eq(secFilingsCacheTable.ticker, normalized));
  if (!row) return null;
  return {
    ticker: row.ticker,
    cik: row.cik,
    entityName: row.entityName,
    source: row.source,
    reportingCurrency: row.reportingCurrency ?? "USD",
    fxToUsd: row.fxToUsd ?? 1,
    adrRatio: row.adrRatio ?? 1,
    fetchedAt: row.fetchedAt.toISOString(),
    filings: row.filings,
    facts: row.facts,
    annuals: row.annuals ?? [],
    quarterlies: row.quarterlies ?? [],
    insiderSummary: row.insiderSummary ?? null,
  };
}
