import { KANON_POSTGRES_DDL as BASELINE_SQL } from "./0001-baseline";

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
