import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle as drizzlePglite, PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runKanonMigrations } from "./migrations";
import * as schema from "./schema";
import { SEED_GLOSSARY_TERMS } from "./seeds/seed-glossary";
import { SEED_REVISIONS } from "./seeds/seed-revisions";
import { SEED_SEC_SNAPSHOTS } from "./seeds/seed-sec";
import { PRESET_SEC_SNAPSHOTS } from "./seeds/seed-sec-presets";
import { SEED_THESIS_RECORDS } from "./seeds/seed-theses";

export type KanonDb = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;
export type KanonDbEngine = "pglite-embedded" | "postgres-external";

export interface DbHealthStats {
  engine: KanonDbEngine;
  thesesCount: number;
  glossaryCount: number;
  secCachedCount: number;
  revisionsCount: number;
}

interface DbState {
  db: KanonDb;
  initPromise: Promise<void>;
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

async function seedIfEmpty(db: KanonDb): Promise<void> {
  const existingTheses = await db.select({ id: schema.thesesTable.id }).from(schema.thesesTable);
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

async function insertSeedTheses(db: KanonDb): Promise<void> {
  for (const item of SEED_THESIS_RECORDS) {
    await db
      .insert(schema.thesesTable)
      .values({
        id: item.id,
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

function resolveDataDir(): string {
  const override = process.env.KANON_DATA_DIR?.trim();
  if (override) {
    fs.mkdirSync(override, { recursive: true });
    return override;
  }
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("apps", "web")) ? path.resolve(cwd, "..", "..") : cwd;
  const dir = path.join(root, ".data", "kanon-pg");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createPersistentState(): DbState {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) {
    const sqlClient = postgres(connectionString, { prepare: false });
    const db = drizzlePostgres(sqlClient, { schema });
    const initPromise = (async () => {
      await runKanonMigrations(async (stmt) => {
        await sqlClient.unsafe(stmt);
      });
      await seedIfEmpty(db);
    })();
    return { db, initPromise };
  }

  const pglite = new PGlite(resolveDataDir());
  const db = drizzlePglite(pglite, { schema });
  const initPromise = (async () => {
    await runKanonMigrations(async (stmt) => {
      await pglite.exec(stmt);
    });
    await seedIfEmpty(db);
  })();
  return { db, initPromise };
}

declare global {
  var __kanonDbState: DbState | undefined;
}

export async function getKanonDb(): Promise<KanonDb> {
  if (!globalThis.__kanonDbState) {
    globalThis.__kanonDbState = createPersistentState();
  }
  await globalThis.__kanonDbState.initPromise;
  return globalThis.__kanonDbState.db;
}

export async function runInTransaction<T>(
  db: KanonDb,
  work: (tx: KanonDb) => Promise<T>,
): Promise<T> {
  if (db instanceof PgliteDatabase) {
    return db.transaction((tx) => work(tx));
  }
  return db.transaction((tx) => work(tx));
}

export async function getDbHealthStats(db: KanonDb): Promise<DbHealthStats> {
  const [theses, glossary, secRows, revRows] = await Promise.all([
    db.select({ id: schema.thesesTable.id }).from(schema.thesesTable),
    db.select({ term: schema.glossaryTermsTable.term }).from(schema.glossaryTermsTable),
    db.select({ ticker: schema.secFilingsCacheTable.ticker }).from(schema.secFilingsCacheTable),
    db.select({ id: schema.thesisRevisionsTable.id }).from(schema.thesisRevisionsTable),
  ]);
  return {
    engine: db instanceof PgliteDatabase ? "pglite-embedded" : "postgres-external",
    thesesCount: theses.length,
    glossaryCount: glossary.length,
    secCachedCount: secRows.length,
    revisionsCount: revRows.length,
  };
}

export async function createMemoryKanonDb(): Promise<{ db: KanonDb; close: () => Promise<void> }> {
  const pglite = new PGlite();
  const db = drizzlePglite(pglite, { schema });
  await runKanonMigrations(async (stmt) => {
    await pglite.exec(stmt);
  });
  await seedIfEmpty(db);
  return { db, close: () => pglite.close() };
}
