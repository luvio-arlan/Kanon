import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePglite, PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  areAllMigrationsApplied,
  isExternalDbBootstrapped,
  type KanonDb,
  seedIfEmpty,
} from "./bootstrap";
import { KANON_MIGRATIONS, runKanonMigrations } from "./migrations";
import { withSystemContext } from "./repositories/security/tenant-context";
import * as schema from "./schema";

export { type KanonDb, runInTransaction } from "./bootstrap";
export type KanonDbEngine = "pglite-embedded" | "postgres-external";

export class MigrationsPendingError extends Error {
  readonly code = "MIGRATIONS_PENDING" as const;

  constructor(message = "Database migrations are pending and KANON_RUNTIME_MIGRATIONS=off.") {
    super(message);
    this.name = "MigrationsPendingError";
  }
}

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

const MIGRATION_ADVISORY_LOCK_KEY = 720194821;

const LOCAL_RLS_ENFORCE_SQL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanon_app_local') THEN
    CREATE ROLE kanon_app_local NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO kanon_app_local;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kanon_app_local;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kanon_app_local;
REVOKE UPDATE, DELETE ON audit_log FROM kanon_app_local;
SET ROLE kanon_app_local;
`;

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

async function readAppliedMigrationIds(sqlClient: postgres.Sql): Promise<Set<string>> {
  try {
    const rows = await sqlClient<{ id: string }[]>`SELECT id FROM schema_migrations`;
    return new Set(rows.map((r) => r.id));
  } catch (err) {
    void err;
    return new Set();
  }
}

async function applyPendingMigrationsTransactional(sqlClient: postgres.Sql): Promise<void> {
  await sqlClient.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MIGRATION_ADVISORY_LOCK_KEY})`;
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  });
  const applied = await readAppliedMigrationIds(sqlClient);
  for (const migration of KANON_MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await sqlClient.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${MIGRATION_ADVISORY_LOCK_KEY})`;
      const existing = await tx<{ id: string }[]>`
        SELECT id FROM schema_migrations WHERE id = ${migration.id} LIMIT 1
      `;
      if (existing.length > 0) return;
      await tx.unsafe(migration.sql);
      await tx`
        INSERT INTO schema_migrations (id, description)
        VALUES (${migration.id}, ${migration.description})
        ON CONFLICT (id) DO NOTHING
      `;
    });
  }
}

export async function initExternalPostgres(sqlClient: postgres.Sql, db: KanonDb): Promise<void> {
  const runtimeMigrationsOff = process.env.KANON_RUNTIME_MIGRATIONS?.trim().toLowerCase() === "off";
  if (runtimeMigrationsOff) {
    if (!(await areAllMigrationsApplied(sqlClient))) {
      throw new MigrationsPendingError();
    }
    return;
  }
  if (await isExternalDbBootstrapped(sqlClient)) return;
  await applyPendingMigrationsTransactional(sqlClient);
  await withSystemContext(db, "migration_seed", (tx) => seedIfEmpty(tx));
}

async function bootstrapPglite(pglite: PGlite, db: KanonDb, enforceRls: boolean): Promise<void> {
  await runKanonMigrations(async (stmt) => {
    await pglite.exec(stmt);
  });
  await withSystemContext(db, "migration_seed", (tx) => seedIfEmpty(tx));
  if (enforceRls) {
    await pglite.exec(LOCAL_RLS_ENFORCE_SQL);
  }
}

function createPersistentState(): DbState {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) {
    const sqlClient = postgres(connectionString, {
      prepare: false,
      max: process.env.VERCEL ? 3 : 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    const db = drizzlePostgres(sqlClient, { schema });
    const initPromise = initExternalPostgres(sqlClient, db).catch(async (err) => {
      await sqlClient.end({ timeout: 2 }).catch((closeErr) => {
        void closeErr;
      });
      throw err;
    });
    return { db, initPromise };
  }

  const pglite = new PGlite(resolveDataDir());
  const db = drizzlePglite(pglite, { schema });
  const enforceRls = process.env.KANON_RLS_ENFORCE_LOCAL === "1";
  const initPromise = bootstrapPglite(pglite, db, enforceRls);
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

export async function pingKanonDb(db: KanonDb): Promise<void> {
  await db.execute(sql`SELECT 1`);
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

export async function createMemoryKanonDb(options?: {
  enforceRls?: boolean;
}): Promise<{ db: KanonDb; pglite: PGlite; close: () => Promise<void> }> {
  const pglite = new PGlite();
  const db = drizzlePglite(pglite, { schema });
  const enforceRls = options?.enforceRls ?? process.env.KANON_RLS_ENFORCE_LOCAL === "1";
  await bootstrapPglite(pglite, db, enforceRls);
  return { db, pglite, close: () => pglite.close() };
}
