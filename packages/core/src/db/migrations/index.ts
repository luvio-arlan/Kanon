import { KANON_POSTGRES_DDL as BASELINE_SQL } from "./0001-baseline";
import { KANON_V4_MIGRATION_SQL } from "./0002-v4-institutional";
import { KANON_ACCOUNTS_MIGRATION_SQL } from "./0003-accounts-auth";
import { KANON_PERF_INDEXES_SQL } from "./0004-perf-indexes";

export interface KanonMigration {
  id: string;
  description: string;
  sql: string;
}

const MIGRATIONS_META_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export const KANON_MIGRATIONS: readonly KanonMigration[] = [
  {
    id: "0001_baseline",
    description: "Initial 9-table KANON Postgres baseline schema",
    sql: BASELINE_SQL,
  },
  {
    id: "0002_v4_institutional",
    description:
      "Expand-only v4 columns (portfolio, valuation drivers, quarterlies, snapshots) & review/agent tables",
    sql: KANON_V4_MIGRATION_SQL,
  },
  {
    id: "0003_accounts_auth",
    description:
      "Multi-user accounts & sessions tables with per-user thesis isolation and +86 phone identity",
    sql: KANON_ACCOUNTS_MIGRATION_SQL,
  },
  {
    id: "0004_perf_indexes",
    description: "Expand-only lookup indexes on hot thesis child tables and cross-check links",
    sql: KANON_PERF_INDEXES_SQL,
  },
];

export const KANON_POSTGRES_DDL = KANON_MIGRATIONS.map((m) => m.sql).join("\n\n");

export async function runKanonMigrations(execSql: (sql: string) => Promise<void>): Promise<void> {
  await execSql(MIGRATIONS_META_SQL);
  for (const migration of KANON_MIGRATIONS) {
    await execSql(migration.sql);
    const safeId = migration.id.replaceAll("'", "''");
    const safeDesc = migration.description.replaceAll("'", "''");
    await execSql(
      `INSERT INTO schema_migrations (id, description) VALUES ('${safeId}', '${safeDesc}') ON CONFLICT (id) DO NOTHING;`,
    );
  }
}
