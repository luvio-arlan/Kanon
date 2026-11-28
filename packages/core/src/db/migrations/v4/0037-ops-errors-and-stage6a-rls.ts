/**
 * Expand-only migration 0037 (Wave U3-1 & U3-2):
 * - Creates `app_error_events` (daily aggregated fingerprint counts, zero PII, system-only RLS).
 * - Enables & forces Stage 6a user-owned RLS on `alert_rules`, `calendar_tokens`,
 *   `ai_usage`, and `user_sec_overrides` matching `0027` predicate semantics.
 */

const STAGE6A_USER_TABLES = [
  "alert_rules",
  "calendar_tokens",
  "ai_usage",
  "user_sec_overrides",
] as const;

function buildStage6aPolicySql(table: string): string {
  const pred = "kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid()";
  return `
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_${table} ON ${table};
DROP POLICY IF EXISTS kanon_rls_${table}_select ON ${table};
DROP POLICY IF EXISTS kanon_rls_${table}_write ON ${table};
CREATE POLICY kanon_rls_${table}_select ON ${table} FOR SELECT USING (${pred});
CREATE POLICY kanon_rls_${table}_write ON ${table} FOR ALL USING (${pred}) WITH CHECK (${pred});`;
}

export const KANON_WAVE_U3_OPS_AND_RLS_SQL = `
CREATE TABLE IF NOT EXISTS app_error_events (
  fingerprint TEXT NOT NULL,
  day TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('server', 'client', 'job')),
  route TEXT NOT NULL,
  code TEXT NOT NULL,
  sample_request_id TEXT,
  count INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fingerprint, day)
);

ALTER TABLE app_error_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_error_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_app_error_events_system ON app_error_events;
CREATE POLICY kanon_rls_app_error_events_system ON app_error_events
  FOR ALL USING (kanon_rls_is_system()) WITH CHECK (kanon_rls_is_system());

${STAGE6A_USER_TABLES.map(buildStage6aPolicySql).join("\n")}
`;
