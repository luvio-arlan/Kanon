import { KANON_RLS_FORCE_SQL } from "./0024-rls-force";
import { KANON_RLS_SPLIT_POLICIES_SQL } from "./0025-rls-split-policies";
import { KANON_Q5_INVITES_LEDGER_OPENING_SQL } from "./0026-q5-invites-ledger-opening";
import { KANON_RLS_FUNCTIONS_AND_SPLIT_SQL } from "./0027-rls-functions-and-split";
import { KANON_RLS_FAIL_CLOSED_SQL } from "./0028-rls-fail-closed";
import { KANON_FILING_REDLINES_SQL } from "./0029-filing-redlines";
import { KANON_SEGMENT_REPORTS_SQL } from "./0030-segment-reports";
import { KANON_GUIDANCE_LEDGER_SQL } from "./0031-guidance-ledger";
import { KANON_FILING_CHUNKS_FTS_SQL } from "./0032-filing-chunks-fts";
import { KANON_DECISION_SNAPSHOTS_SQL } from "./0033-decision-snapshots";
import { KANON_WAVE_U0_INTEGRITY_SQL } from "./0034-wave-u0-integrity";

export const KANON_V3_MIGRATIONS = [
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
  {
    id: "0028_rls_fail_closed",
    description: "Atomic fail-closed RLS switch: flip kanon_rls_open() to constant false (Phase D)",
    sql: KANON_RLS_FAIL_CLOSED_SQL,
  },
  {
    id: "0029_filing_redlines",
    description:
      "Expand-only filing_redlines table, filing_chunks norm_hash/extract_version columns & section index (R1)",
    sql: KANON_FILING_REDLINES_SQL,
  },
  {
    id: "0030_segment_reports",
    description:
      "Expand-only SEC dimensional segment_reports & segment_lines tables with public-derived RLS (R2)",
    sql: KANON_SEGMENT_REPORTS_SQL,
  },
  {
    id: "0031_guidance_ledger",
    description:
      "Expand-only structured guidance_commitments table with HITL checks, RLS & legacy note backfill (R3)",
    sql: KANON_GUIDANCE_LEDGER_SQL,
  },
  {
    id: "0032_filing_chunks_fts",
    description:
      "Expand-only expression GIN full-text index on filing_chunks(to_tsvector('english', text)) (R4)",
    sql: KANON_FILING_CHUNKS_FTS_SQL,
  },
  {
    id: "0033_decision_snapshots",
    description:
      "Expand-only immutable decision_snapshots & append-only hypothesis_status_events with triggers, RLS & backfill (S3)",
    sql: KANON_DECISION_SNAPSHOTS_SQL,
  },
  {
    id: "0034_wave_u0_integrity",
    description:
      "Expand-only Wave U0 integrity: segment profit_reconciled/period_kind, guidance basis/freeze, snapshot survivorship RLS & legacy mixed-currency account flag",
    sql: KANON_WAVE_U0_INTEGRITY_SQL,
  },
] as const;
