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
import { KANON_V7_RESEARCH_OS_SQL } from "./0011-v7-research-os";
import { KANON_USER_SEC_OVERRIDES_SQL } from "./v2/0012-user-sec-overrides";
import { KANON_SECURITY_TOTP_SQL } from "./v2/0013-security-totp";
import { KANON_WAREHOUSE_CORE_SQL } from "./v2/0014-warehouse-core";
import { KANON_FACTS_JOBS_CHUNKS_SQL } from "./v2/0015-facts-jobs-chunks";
import { KANON_MODEL_VERSIONS_SQL } from "./v2/0016-model-versions";
import { KANON_AI_USAGE_AND_CREDS_SQL } from "./v2/0017-ai-usage-and-creds";
import { KANON_INBOX_CATALYSTS_FORECASTS_SQL } from "./v2/0018-inbox-catalysts-forecasts";
import { KANON_PORTFOLIO_LEDGER_SQL } from "./v2/0019-portfolio-ledger";
import { KANON_TEAMS_IC_AUDIT_SQL } from "./v2/0020-teams-ic-audit";
import { KANON_WAVE_I_SECURITY_SQL } from "./v2/0021-wave-i-security";
import { KANON_WAVE_L_M_VECTORS_RLS_SQL } from "./v2/0022-wave-l-m-vectors-rls";
import { KANON_WAVE_O_INVITATIONS_QUEUE_ALERTS_SQL } from "./v2/0023-wave-o-invitations-queue-alerts";
import { KANON_RLS_FORCE_SQL } from "./v3/0024-rls-force";
import { KANON_RLS_SPLIT_POLICIES_SQL } from "./v3/0025-rls-split-policies";
import { KANON_Q5_INVITES_LEDGER_OPENING_SQL } from "./v3/0026-q5-invites-ledger-opening";
import { KANON_RLS_FUNCTIONS_AND_SPLIT_SQL } from "./v3/0027-rls-functions-and-split";

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
  {
    id: "0011_v7_research_os",
    description:
      "Expand-only v7 research notes library, hypothesis KPI rules, Form 4/FX SEC fields & trade-position sync columns",
    sql: KANON_V7_RESEARCH_OS_SQL,
  },
  {
    id: "0012_user_sec_overrides",
    description:
      "Expand-only tenant-isolated manual SEC financial overrides table (prevents cross-tenant cache poisoning)",
    sql: KANON_USER_SEC_OVERRIDES_SQL,
  },
  {
    id: "0013_security_totp",
    description:
      "Expand-only TOTP 2FA factors and per-account exponential login lockout tables (W7.4)",
    sql: KANON_SECURITY_TOTP_SQL,
  },
  {
    id: "0014_warehouse_core",
    description:
      "Expand-only security master, daily FX rates, daily price bars, and corporate actions tables (W1.1-W1.3)",
    sql: KANON_WAREHOUSE_CORE_SQL,
  },
  {
    id: "0015_facts_jobs_chunks",
    description:
      "Expand-only point-in-time filings/facts, Postgres job queue, filing chunks, thesis peers, and estimate snapshots (W1.4-W1.7)",
    sql: KANON_FACTS_JOBS_CHUNKS_SQL,
  },
  {
    id: "0016_model_versions",
    description: "Expand-only append-only valuation model version snapshots (W2.4)",
    sql: KANON_MODEL_VERSIONS_SQL,
  },
  {
    id: "0017_ai_usage_and_creds",
    description:
      "Expand-only AI token usage metering and server-side AES-GCM BYOK credentials vault (W3.5)",
    sql: KANON_AI_USAGE_AND_CREDS_SQL,
  },
  {
    id: "0018_inbox_catalysts_forecasts",
    description:
      "Expand-only research inbox, alert rules, dated catalysts, ICS calendar tokens, and DB-immutable forecasts (W4.1-W5.1)",
    sql: KANON_INBOX_CATALYSTS_FORECASTS_SQL,
  },
  {
    id: "0019_portfolio_ledger",
    description:
      "Expand-only zero-leverage portfolio accounts, transactions, and FIFO lot accounting ledger (W6.1)",
    sql: KANON_PORTFOLIO_LEDGER_SQL,
  },
  {
    id: "0020_teams_ic_audit",
    description:
      "Expand-only multi-tenant organizations, RBAC memberships, IC approvals, comments, restricted list, append-only audit log & covering indexes (W7.1-W7.3, W8.3)",
    sql: KANON_TEAMS_IC_AUDIT_SQL,
  },
  {
    id: "0021_wave_i_security",
    description:
      "Expand-only ledger CHECK constraints, realized_pnl/external_ref, forecast re-resolve/delete guards, audit_log hash chain + TRUNCATE guard, inbox dedupe & calendar token uniqueness",
    sql: KANON_WAVE_I_SECURITY_SQL,
  },
  {
    id: "0022_wave_l_m_vectors_rls",
    description:
      "Expand-only filing_chunks incremental content_hash + embedding_json and tenant-scoped Postgres RLS policies",
    sql: KANON_WAVE_L_M_VECTORS_RLS_SQL,
  },
  {
    id: "0023_wave_o_invitations_queue_alerts",
    description:
      "Expand-only org invitations, accepted_at membership gating, org-scoped accounts, job priority/quota, single in-review IC & edge-triggered alert state",
    sql: KANON_WAVE_O_INVITATIONS_QUEUE_ALERTS_SQL,
  },
  {
    id: "0024_rls_force",
    description:
      "Expand-only FORCE ROW LEVEL SECURITY on primary tenant tables & calendar token hash backfill",
    sql: KANON_RLS_FORCE_SQL,
  },
  {
    id: "0025_rls_split_policies",
    description: "Expand-only read/write split RLS policies on theses & child tenant tables",
    sql: KANON_RLS_SPLIT_POLICIES_SQL,
  },
  {
    id: "0026_q5_invites_ledger_opening",
    description:
      "Expand-only org invitation revocation, security sec_status, nullable catalyst draft fields & opening-cash ledger backfill",
    sql: KANON_Q5_INVITES_LEDGER_OPENING_SQL,
  },
  {
    id: "0027_rls_functions_and_split",
    description:
      "Expand-only RLS helper functions and command-split policies across 21 tenant tables (Phase B, fail-open switch)",
    sql: KANON_RLS_FUNCTIONS_AND_SPLIT_SQL,
  },
];

export const KANON_POSTGRES_DDL = KANON_MIGRATIONS.map((m) => m.sql).join("\n\n");

export async function runKanonMigrations(
  execSql: (sql: string) => Promise<void>,
  appliedIds?: ReadonlySet<string>,
): Promise<void> {
  await execSql(MIGRATIONS_META_SQL);
  for (const migration of KANON_MIGRATIONS) {
    if (appliedIds?.has(migration.id)) continue;
    await execSql(migration.sql);
    const safeId = migration.id.replaceAll("'", "''");
    const safeDesc = migration.description.replaceAll("'", "''");
    await execSql(
      `INSERT INTO schema_migrations (id, description) VALUES ('${safeId}', '${safeDesc}') ON CONFLICT (id) DO NOTHING;`,
    );
  }
}
