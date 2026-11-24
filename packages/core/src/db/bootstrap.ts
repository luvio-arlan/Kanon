import { eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import { DEFAULT_WORKSPACE_USER_ID } from "../contracts/auth-contracts";
import { KANON_MIGRATIONS } from "./migrations";
import * as schema from "./schema";
import { SEED_GLOSSARY_TERMS } from "./seeds/seed-glossary";
import { SEED_REVISIONS } from "./seeds/seed-revisions";
import { SEED_SEC_SNAPSHOTS } from "./seeds/seed-sec";
import { PRESET_SEC_SNAPSHOTS } from "./seeds/seed-sec-presets";
import { SEED_THESIS_RECORDS } from "./seeds/seed-theses";

export type KanonDb = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

interface BootstrapProbeRow {
  mig_count: number;
  demo_count: number;
  glossary_count: number;
  sec_count: number;
  rev_count: number;
}

export async function isExternalDbBootstrapped(sqlClient: postgres.Sql): Promise<boolean> {
  const expectedMigIds = KANON_MIGRATIONS.map((m) => m.id);
  const expectedSecCount = SEED_SEC_SNAPSHOTS.length + PRESET_SEC_SNAPSHOTS.length;
  try {
    const rows = await sqlClient<BootstrapProbeRow[]>`
      SELECT
        (SELECT count(*)::int FROM schema_migrations WHERE id = ANY(${expectedMigIds})) AS mig_count,
        (SELECT count(*)::int FROM theses WHERE user_id = ${DEFAULT_WORKSPACE_USER_ID}) AS demo_count,
        (SELECT count(*)::int FROM glossary_terms) AS glossary_count,
        (SELECT count(*)::int FROM sec_filings_cache) AS sec_count,
        (SELECT count(*)::int FROM thesis_revisions) AS rev_count
    `;
    const stats = rows[0];
    if (!stats) return false;
    return (
      stats.mig_count === expectedMigIds.length &&
      stats.demo_count >= SEED_THESIS_RECORDS.length &&
      stats.glossary_count >= SEED_GLOSSARY_TERMS.length &&
      stats.sec_count >= expectedSecCount &&
      stats.rev_count > 0
    );
  } catch (probeErr) {
    void probeErr;
    return false;
  }
}

async function seedSecAndRevisions(db: KanonDb): Promise<void> {
  for (const snap of [...SEED_SEC_SNAPSHOTS, ...PRESET_SEC_SNAPSHOTS]) {
    await db
      .insert(schema.secFilingsCacheTable)
      .values({
        ticker: snap.ticker,
        cik: snap.cik,
        entityName: snap.entityName,
        source: snap.source,
        filings: snap.filings,
        facts: snap.facts,
        annuals: snap.annuals,
        quarterlies: snap.quarterlies ?? [],
        fetchedAt: new Date(snap.fetchedAt),
      })
      .onConflictDoUpdate({
        target: schema.secFilingsCacheTable.ticker,
        set: { annuals: snap.annuals, quarterlies: snap.quarterlies ?? [] },
      });
  }
  const existingRevs = await db
    .select({ id: schema.thesisRevisionsTable.id })
    .from(schema.thesisRevisionsTable)
    .limit(1);
  if (existingRevs.length === 0) {
    await db
      .insert(schema.thesisRevisionsTable)
      .values([...SEED_REVISIONS])
      .onConflictDoNothing();
  }
}

async function backfillBuySideFilters(db: KanonDb): Promise<void> {
  for (const item of SEED_THESIS_RECORDS) {
    const [row] = await db
      .select({ id: schema.thesesTable.id, businessFilter: schema.thesesTable.businessFilter })
      .from(schema.thesesTable)
      .where(eq(schema.thesesTable.id, item.id));
    if (row && !row.businessFilter.variantPerception) {
      await db
        .update(schema.thesesTable)
        .set({
          businessFilter: {
            ...row.businessFilter,
            consensusView: item.businessFilter.consensusView,
            variantPerception: item.businessFilter.variantPerception,
            keyDebate: item.businessFilter.keyDebate,
            preMortem: item.businessFilter.preMortem,
          },
        })
        .where(eq(schema.thesesTable.id, item.id));
    }
  }
}

async function insertSeedTheses(db: KanonDb): Promise<void> {
  for (const item of SEED_THESIS_RECORDS) {
    await db
      .insert(schema.thesesTable)
      .values({
        id: item.id,
        userId: DEFAULT_WORKSPACE_USER_ID,
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
        lastReviewedLabel: item.lastReviewedLabel,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.hypothesesTable)
      .values(item.hypotheses.map((h, idx) => ({ ...h, thesisId: item.id, sortOrder: idx })))
      .onConflictDoNothing();

    await db
      .insert(schema.crossChecksTable)
      .values(item.crossChecks.map((cc) => ({ ...cc, thesisId: item.id })))
      .onConflictDoNothing();

    await db
      .insert(schema.valuationScenariosTable)
      .values({ thesisId: item.id, ...item.valuationInput })
      .onConflictDoNothing();

    await db
      .insert(schema.disciplineEntriesTable)
      .values(item.disciplineEntries.map((entry) => ({ ...entry, thesisId: item.id })))
      .onConflictDoNothing();
  }
}

export async function seedIfEmpty(db: KanonDb): Promise<void> {
  const existingTheses = await db
    .select({ id: schema.thesesTable.id })
    .from(schema.thesesTable)
    .where(eq(schema.thesesTable.userId, DEFAULT_WORKSPACE_USER_ID));
  if (existingTheses.length === 0) {
    await insertSeedTheses(db);
  }
  const existingTerms = await db
    .select({ term: schema.glossaryTermsTable.term })
    .from(schema.glossaryTermsTable);
  if (existingTerms.length === 0) {
    await db
      .insert(schema.glossaryTermsTable)
      .values([...SEED_GLOSSARY_TERMS])
      .onConflictDoNothing();
  }
  await seedSecAndRevisions(db);
  await backfillBuySideFilters(db);
}
