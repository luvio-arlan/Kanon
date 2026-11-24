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
      note: parsed.note,
    });
    await tx
      .update(thesesTable)
      .set({ lastReviewedLabel: "刚刚复盘 · 纪律检查单", updatedAt: new Date() })
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
      filings: parsed.filings,
      facts: parsed.facts,
      annuals: parsed.annuals,
      quarterlies: parsed.quarterlies,
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: secFilingsCacheTable.ticker,
      set: {
        cik: parsed.cik,
        entityName: parsed.entityName,
        source: parsed.source,
        filings: parsed.filings,
        facts: parsed.facts,
        annuals: parsed.annuals,
        quarterlies: parsed.quarterlies,
        fetchedAt,
      },
    });
  return parsed;
}

export async function listGlossaryTerms(db: KanonDb): Promise<GlossaryTerm[]> {
  return db.select().from(glossaryTermsTable).orderBy(asc(glossaryTermsTable.term));
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
    fetchedAt: row.fetchedAt.toISOString(),
    filings: row.filings,
    facts: row.facts,
    annuals: row.annuals ?? [],
    quarterlies: row.quarterlies ?? [],
  };
}
