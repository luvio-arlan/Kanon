import { KANON_POSTGRES_DDL as BASELINE_SQL } from "./0001-baseline";
import { KANON_V4_MIGRATION_SQL } from "./0002-v4-institutional";
import { KANON_ACCOUNTS_MIGRATION_SQL } from "./0003-accounts-auth";
import { KANON_PERF_INDEXES_SQL } from "./0004-perf-indexes";
import { KANON_CATALYSTS_MIGRATION_SQL } from "./0005-catalysts";
import { KANON_SECURITY_MCP_CACHE_SQL } from "./0006-security-mcp-cache";
import { KANON_RATE_LIMIT_BUCKETS_SQL } from "./0007-rate-limit-buckets";
import { KANON_SEC_FILING_DOCS_CACHE_SQL } from "./0008-sec-filing-docs-cache";
import { KANON_CROSS_CHECK_HYPOTHESIS_LINK_SQL } from "./0009-cross-check-hypothesis-link";
import { KANON_HEAL_RUNAWAY_VALUATION_SQL } from "./0010-heal-runaway-valuation";

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
  {
    id: "0005_catalysts",
    description: "Expand-only institutional catalyst & event tracking table for theses",
    sql: KANON_CATALYSTS_MIGRATION_SQL,
  },
  {
    id: "0006_security_mcp_cache",
    description:
      "Expand-only Personal Access Tokens (MCP) & serverless Postgres market quote cache",
    sql: KANON_SECURITY_MCP_CACHE_SQL,
  },
  {
    id: "0007_rate_limit_buckets",
    description:
      "Expand-only persistent sliding/fixed-window rate limit buckets for serverless API",
    sql: KANON_RATE_LIMIT_BUCKETS_SQL,
  },
  {
    id: "0008_sec_filing_docs_cache",
    description: "Expand-only persistent parsed SEC filing sections & cross-quarter diffs cache",
    sql: KANON_SEC_FILING_DOCS_CACHE_SQL,
  },
  {
    id: "0009_cross_check_hypothesis_link",
    description:
      "Expand-only cross_check -> hypothesis lineage reference for Step 2/3 bidirectional links",
    sql: KANON_CROSS_CHECK_HYPOTHESIS_LINK_SQL,
  },
  {
    id: "0010_heal_runaway_valuation",
    description:
      "Idempotent non-destructive repair of corrupted runaway valuation_scenarios rows (>100k EPS or >500x PE)",
    sql: KANON_HEAL_RUNAWAY_VALUATION_SQL,
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
