import { KANON_WAVE_U1_MULTI_CURRENCY_SQL } from "./0035-multi-currency-ledger";
import { KANON_WAVE_U1_GUIDANCE_CANDIDATES_SQL } from "./0036-guidance-candidates";
import { KANON_WAVE_U3_OPS_AND_RLS_SQL } from "./0037-ops-errors-and-stage6a-rls";
import { KANON_WAVE_V0_APP_ROLE_GRANTS_SQL } from "./0038-app-role-grants";
import { KANON_WAVE_V0_NUMERIC_EXCHANGE_REFLAG_SQL } from "./0039-numeric-exchange-currency-reflag";
import { KANON_WAVE_V1_GUIDANCE_CANDIDATE_RETRACTION_SQL } from "./0040-guidance-candidate-retraction";
import { KANON_WAVE_V2_STAGE6B_AUTH_AUDIT_RLS_SQL } from "./0041-stage6b-auth-audit-rls";
import { KANON_WAVE_V2_AI_USAGE_KEY_SOURCE_SQL } from "./0042-ai-usage-key-source";

export const KANON_V4_MIGRATIONS: ReadonlyArray<{
  id: string;
  description: string;
  sql: string;
}> = [
  {
    id: "0035_multi_currency_ledger",
    description:
      "Wave U1-1 expand-only multi-currency transactions, FX provenance, reversal index, and securities trading currency",
    sql: KANON_WAVE_U1_MULTI_CURRENCY_SQL,
  },
  {
    id: "0036_guidance_candidates",
    description:
      "Wave U1-2 expand-only 8-K Ex-99.1 guidance_candidates table (public derived RLS) and candidate adoption FK",
    sql: KANON_WAVE_U1_GUIDANCE_CANDIDATES_SQL,
  },
  {
    id: "0037_ops_errors_and_stage6a_rls",
    description:
      "Wave U3 expand-only app_error_events table (system-only RLS) and Stage 6a user-owned RLS on 4 tenant tables",
    sql: KANON_WAVE_U3_OPS_AND_RLS_SQL,
  },
  {
    id: "0038_app_role_grants",
    description:
      "Wave V0-1 conditional NOBYPASSRLS kanon_app grants, audit_log append-only revoke, and default privileges",
    sql: KANON_WAVE_V0_APP_ROLE_GRANTS_SQL,
  },
  {
    id: "0039_numeric_exchange_currency_reflag",
    description:
      "Wave V0-4 re-flag accounts whose canonical 0700-HK style tickers were back-filled as USD identity",
    sql: KANON_WAVE_V0_NUMERIC_EXCHANGE_REFLAG_SQL,
  },
  {
    id: "0040_guidance_candidate_retraction",
    description:
      "Wave V1-1 expand-only guidance_candidates rule_version + retraction of basis-merged rule/1 rows",
    sql: KANON_WAVE_V1_GUIDANCE_CANDIDATE_RETRACTION_SQL,
  },
  {
    id: "0041_stage6b_auth_audit_rls",
    description:
      "Wave V2-1 Stage 6b RLS on sessions, api_tokens, user_totp_factors, audit_log + definer helpers",
    sql: KANON_WAVE_V2_STAGE6B_AUTH_AUDIT_RLS_SQL,
  },
  {
    id: "0042_ai_usage_key_source",
    description:
      "Wave V2-2 expand-only ai_usage.key_source (byok | hosted) for hosted-AI daily quota",
    sql: KANON_WAVE_V2_AI_USAGE_KEY_SOURCE_SQL,
  },
];
