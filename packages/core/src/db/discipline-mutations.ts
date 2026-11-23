import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import {
  type CreateDisciplineEntryInput,
  CreateDisciplineEntrySchema,
  type SecSnapshot,
  SecSnapshotSchema,
  type ThesisDetail,
} from "../schemas/research";
import type { KanonDb } from "./client";
import { disciplineEntriesTable, secFilingsCacheTable, thesesTable } from "./schema";
import { getThesisById } from "./thesis-queries";

export async function addDisciplineEntry(
  db: KanonDb,
  thesisId: string,
  rawInput: CreateDisciplineEntryInput,
): Promise<ThesisDetail | null> {
  const parsed = CreateDisciplineEntrySchema.parse(rawInput);
  await db.insert(disciplineEntriesTable).values({
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
  await db
    .update(thesesTable)
    .set({ lastReviewedLabel: "刚刚复盘 · 纪律检查单", updatedAt: new Date() })
    .where(eq(thesesTable.id, thesisId));

  return getThesisById(db, thesisId);
}

export async function deleteThesis(db: KanonDb, thesisId: string): Promise<boolean> {
  const existing = await getThesisById(db, thesisId);
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
        fetchedAt,
      },
    });
  return parsed;
}
