import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { filingsTable } from "../../schema";
import type { UpsertFilingInput } from "./facts-pit-types";

export const PERIODIC_FORMS = ["10-K", "10-K/A", "20-F", "20-F/A", "10-Q", "10-Q/A"] as const;
export type PeriodicForm = (typeof PERIODIC_FORMS)[number];
export type StoredFilingRow = typeof filingsTable.$inferSelect;

/**
 * Upserts a filing without letting a later low-fidelity writer (e.g. PIT directory URL or empty items)
 * clobber an already-resolved primary document URL, fiscal metadata, or Form 8-K item codes (U0-3).
 */
export async function upsertFiling(db: KanonDb, input: UpsertFilingInput): Promise<void> {
  await db
    .insert(filingsTable)
    .values({
      accession: input.accession,
      securityId: input.securityId,
      cik: input.cik,
      form: input.form,
      filedAt: input.filedAt,
      periodEnd: input.periodEnd ?? null,
      fiscalYear: input.fiscalYear ?? null,
      fiscalPeriod: input.fiscalPeriod ?? null,
      items: input.items ?? [],
      primaryDocUrl: input.primaryDocUrl,
      amendsAccession: input.amendsAccession ?? null,
      parseStatus: input.parseStatus ?? "parsed",
    })
    .onConflictDoUpdate({
      target: filingsTable.accession,
      set: {
        primaryDocUrl: sql`CASE WHEN ${filingsTable.primaryDocUrl} LIKE '%/' AND EXCLUDED.primary_doc_url NOT LIKE '%/' THEN EXCLUDED.primary_doc_url ELSE ${filingsTable.primaryDocUrl} END`,
        fiscalYear: sql`COALESCE(${filingsTable.fiscalYear}, EXCLUDED.fiscal_year)`,
        fiscalPeriod: sql`COALESCE(${filingsTable.fiscalPeriod}, EXCLUDED.fiscal_period)`,
        periodEnd: sql`COALESCE(${filingsTable.periodEnd}, EXCLUDED.period_end)`,
        items: sql`CASE WHEN jsonb_array_length(EXCLUDED.items) > 0 THEN EXCLUDED.items ELSE ${filingsTable.items} END`,
        parseStatus: input.parseStatus ?? "parsed",
        amendsAccession: sql`COALESCE(EXCLUDED.amends_accession, ${filingsTable.amendsAccession})`,
      },
    });
}

/** Updates a directory-index primary_doc_url once resolved to the actual HTML filing document (U0-3). */
export async function updateFilingPrimaryDocUrl(
  db: KanonDb,
  accession: string,
  primaryDocUrl: string,
): Promise<void> {
  if (!primaryDocUrl || primaryDocUrl.endsWith("/")) return;
  await db.update(filingsTable).set({ primaryDocUrl }).where(eq(filingsTable.accession, accession));
}

/**
 * Sole gateway for reading periodic filings (10-K/20-F/10-Q and amendments) without Form 4 / 8-K
 * crowding out older annual/quarterly reports (U0-3 / G22).
 */
export async function listPeriodicFilingsBySecurity(
  db: KanonDb,
  securityId: string,
  options?: { forms?: readonly PeriodicForm[]; limit?: number },
): Promise<StoredFilingRow[]> {
  const forms = options?.forms?.length ? [...options.forms] : [...PERIODIC_FORMS];
  const limit = Math.max(1, Math.min(100, options?.limit ?? 24));
  return db
    .select()
    .from(filingsTable)
    .where(and(eq(filingsTable.securityId, securityId), inArray(filingsTable.form, forms)))
    .orderBy(desc(filingsTable.filedAt))
    .limit(limit);
}

/**
 * Picks the target periodic filing preferring original filings over `/A` amendments
 * (e.g. Part III-only 10-K/A) when an original exists for the same period_end (U0-3).
 */
export function selectPrimaryPeriodicFiling<
  T extends { accession: string; form: string; periodEnd: string | null },
>(filings: readonly T[], requestedAccession?: string | null): T | null {
  if (requestedAccession) {
    const exact = filings.find((f) => f.accession === requestedAccession);
    if (exact) return exact;
  }
  const latest = filings[0];
  if (!latest) return null;
  if (!latest.form.toUpperCase().endsWith("/A")) return latest;
  const base = latest.form.toUpperCase().replace(/\/A$/, "");
  const originalSamePeriod = filings.find(
    (f) =>
      f.form.toUpperCase() === base &&
      latest.periodEnd !== null &&
      f.periodEnd === latest.periodEnd,
  );
  if (originalSamePeriod) return originalSamePeriod;
  return filings.find((f) => !f.form.toUpperCase().endsWith("/A")) ?? latest;
}
