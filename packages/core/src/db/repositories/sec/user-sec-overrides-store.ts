import { and, eq } from "drizzle-orm";
import { type SecSnapshot, SecSnapshotSchema } from "../../../schemas/research";
import type { KanonDb } from "../../client";
import { userSecOverridesTable } from "../../schema";
import { getSecSnapshot } from "../discipline-mutations";

function mergeOverrideWithGlobal(
  override: typeof userSecOverridesTable.$inferSelect,
  globalSnap: SecSnapshot | null,
): SecSnapshot {
  return {
    ticker: override.ticker,
    cik: override.cik,
    entityName: override.entityName,
    source: "manual-verified",
    reportingCurrency: override.reportingCurrency ?? "USD",
    fxToUsd: override.fxToUsd ?? 1,
    adrRatio: override.adrRatio ?? 1,
    fetchedAt: override.updatedAt.toISOString(),
    filings: globalSnap?.filings ?? [],
    facts: override.facts ?? [],
    annuals: override.annuals ?? [],
    quarterlies: globalSnap?.quarterlies ?? [],
    insiderSummary: globalSnap?.insiderSummary ?? null,
  };
}

export async function getSecSnapshotForUser(
  db: KanonDb,
  ticker: string,
  userId?: string,
): Promise<SecSnapshot | null> {
  const normalized = ticker.trim().toUpperCase();
  if (!userId) return getSecSnapshot(db, normalized);
  const [globalSnap, overrideRows] = await Promise.all([
    getSecSnapshot(db, normalized),
    db
      .select()
      .from(userSecOverridesTable)
      .where(
        and(eq(userSecOverridesTable.userId, userId), eq(userSecOverridesTable.ticker, normalized)),
      )
      .limit(1),
  ]);
  const override = overrideRows[0];
  if (!override) return globalSnap;
  return mergeOverrideWithGlobal(override, globalSnap);
}

export async function upsertUserSecOverride(
  db: KanonDb,
  userId: string,
  rawSnapshot: SecSnapshot,
): Promise<SecSnapshot> {
  const parsed = SecSnapshotSchema.parse({ ...rawSnapshot, source: "manual-verified" });
  const ticker = parsed.ticker.trim().toUpperCase();
  const now = new Date();
  await db
    .insert(userSecOverridesTable)
    .values({
      userId,
      ticker,
      cik: parsed.cik,
      entityName: parsed.entityName,
      reportingCurrency: parsed.reportingCurrency ?? "USD",
      fxToUsd: parsed.fxToUsd ?? 1,
      adrRatio: parsed.adrRatio ?? 1,
      facts: parsed.facts,
      annuals: parsed.annuals,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userSecOverridesTable.userId, userSecOverridesTable.ticker],
      set: {
        cik: parsed.cik,
        entityName: parsed.entityName,
        reportingCurrency: parsed.reportingCurrency ?? "USD",
        fxToUsd: parsed.fxToUsd ?? 1,
        adrRatio: parsed.adrRatio ?? 1,
        facts: parsed.facts,
        annuals: parsed.annuals,
        updatedAt: now,
      },
    });
  return { ...parsed, ticker, source: "manual-verified", fetchedAt: now.toISOString() };
}
