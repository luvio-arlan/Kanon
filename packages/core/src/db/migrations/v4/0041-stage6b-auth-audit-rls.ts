/**
 * Migration 0041 · Wave V2-1 Stage 6b (part 1): RLS on `sessions`, `api_tokens`, `user_totp_factors`
 * and `audit_log`. Pre-auth lookups (session / PAT / TOTP at login) already run in `auth_bootstrap`
 * system context, so no login path depends on tenant visibility.
 *
 * Definer helpers (owner must hold BYPASSRLS, true for the Neon owner role and PGlite superuser):
 * - `kanon_org_role(org)`: the CALLER's own accepted role, so policies never recurse into memberships.
 * - `kanon_audit_chain_tail()`: only the global tail hash, so tenant RLS can never fork the hash chain.
 * `memberships`, `org_invitations`, `restricted_list` stay pending: org creation and invitation
 * acceptance write before the actor is a member and need definer-mediated flows first.
 */
const USER_PRED = "kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid()";

function userOwned(table: string): string {
  return `
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_${table}_select ON ${table};
DROP POLICY IF EXISTS kanon_rls_${table}_write ON ${table};
CREATE POLICY kanon_rls_${table}_select ON ${table} FOR SELECT USING (${USER_PRED});
CREATE POLICY kanon_rls_${table}_write ON ${table} FOR ALL USING (${USER_PRED}) WITH CHECK (${USER_PRED});`;
}

export const KANON_WAVE_V2_STAGE6B_AUTH_AUDIT_RLS_SQL = `
CREATE OR REPLACE FUNCTION kanon_org_role(oid_ text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.role FROM memberships m
  WHERE m.org_id = oid_ AND m.user_id = kanon_rls_uid() AND m.accepted_at IS NOT NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION kanon_audit_chain_tail() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT entry_hash FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 1
$$;
${userOwned("sessions")}
${userOwned("api_tokens")}
${userOwned("user_totp_factors")}

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_audit_log_select ON audit_log;
DROP POLICY IF EXISTS kanon_rls_audit_log_insert ON audit_log;
CREATE POLICY kanon_rls_audit_log_select ON audit_log FOR SELECT USING (
  kanon_rls_is_system() OR kanon_rls_open() OR actor_user_id = kanon_rls_uid()
  OR (org_id IS NOT NULL AND kanon_org_role(org_id) = 'owner')
);
CREATE POLICY kanon_rls_audit_log_insert ON audit_log FOR INSERT WITH CHECK (
  kanon_rls_is_system() OR kanon_rls_open() OR actor_user_id = kanon_rls_uid()
);
`;
