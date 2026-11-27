import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { seedIfEmpty } from "./bootstrap";
import { KANON_MIGRATIONS } from "./migrations";
import { withSystemContext } from "./repositories/security/tenant-context";
import * as schema from "./schema";

const MIGRATION_LOCK_KEY = 720194821;

function resolveMigrationUrl(): string {
  const url = process.env.DATABASE_URL_MIGRATE?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    process.stderr.write("DATABASE_URL_MIGRATE / DATABASE_URL is not set. Aborting db:migrate.\n");
    process.exit(1);
  }
  const allowPooled = process.env.KANON_ALLOW_POOLED_MIGRATE === "1";
  try {
    const parsed = new URL(url);
    if (!allowPooled && parsed.hostname.includes("-pooler")) {
      process.stderr.write(
        "Refusing to run migrations against a pooled host (-pooler). Use DATABASE_URL_MIGRATE with a direct connection or set KANON_ALLOW_POOLED_MIGRATE=1.\n",
      );
      process.exit(1);
    }
  } catch (err) {
    void err;
  }
  return url;
}

async function applyMigrationBatch(sqlClient: postgres.Sql): Promise<number> {
  await sqlClient`SELECT set_config('kanon.system', 'on', false)`;
  await sqlClient.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  });
  const rows = await sqlClient<{ id: string }[]>`SELECT id FROM schema_migrations`;
  const applied = new Set(rows.map((r) => r.id));
  let appliedCount = 0;
  for (const migration of KANON_MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await sqlClient.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
      await tx`SELECT set_config('kanon.system', 'on', true)`;
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
      appliedCount += 1;
    });
  }
  return appliedCount;
}

async function main() {
  const url = resolveMigrationUrl();
  const shouldSeed = process.argv.includes("--seed");
  const sqlClient = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });
  try {
    const appliedCount = await applyMigrationBatch(sqlClient);
    if (shouldSeed) {
      const db = drizzlePostgres(sqlClient, { schema });
      await withSystemContext(db, "migration_seed", (tx) => seedIfEmpty(tx));
      process.stdout.write("[kanon db:migrate] Seeded baseline data (--seed).\n");
    }
    process.stdout.write(
      `[kanon db:migrate] Completed (${appliedCount} applied, ${KANON_MIGRATIONS.length} total).\n`,
    );
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

void main();
