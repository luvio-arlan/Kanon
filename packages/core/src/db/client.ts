import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePglite, PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isExternalDbBootstrapped, type KanonDb, seedIfEmpty } from "./bootstrap";
import { runKanonMigrations } from "./migrations";
import * as schema from "./schema";

export type { KanonDb } from "./bootstrap";
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

function resolveDataDir(): string {
  const override = process.env.KANON_DATA_DIR?.trim();
  if (override) {
    fs.mkdirSync(override, { recursive: true });
    return override;
  }
  if (process.env.VERCEL) {
    const tmpDir = path.join("/tmp", "kanon-pg");
    fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
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
    const sqlClient = postgres(connectionString, {
      prepare: false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    const db = drizzlePostgres(sqlClient, { schema });
    const initPromise = (async () => {
      if (await isExternalDbBootstrapped(sqlClient)) {
        return;
      }
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
  try {
    await globalThis.__kanonDbState.initPromise;
  } catch (err) {
    globalThis.__kanonDbState = undefined;
    throw err;
  }
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
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM theses) AS theses_count,
      (SELECT count(*)::int FROM glossary_terms) AS glossary_count,
      (SELECT count(*)::int FROM sec_filings_cache) AS sec_cached_count,
      (SELECT count(*)::int FROM thesis_revisions) AS revisions_count
  `);
  const rows = Array.isArray(result) ? result : result.rows;
  const row = (rows[0] ?? {}) as Record<string, unknown>;
  return {
    engine: db instanceof PgliteDatabase ? "pglite-embedded" : "postgres-external",
    thesesCount: Number(row.theses_count ?? 0),
    glossaryCount: Number(row.glossary_count ?? 0),
    secCachedCount: Number(row.sec_cached_count ?? 0),
    revisionsCount: Number(row.revisions_count ?? 0),
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
