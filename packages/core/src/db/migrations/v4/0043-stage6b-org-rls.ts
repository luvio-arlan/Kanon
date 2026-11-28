/**
 * Migration 0043 · Wave V2-1 Stage 6b (complete): RLS on `memberships`, `org_invitations`,
 * and `restricted_list` (40/40 tenant & derived tables covered; zero pending).
 *
 * - Rewrites `kanon_thesis_writable` / `kanon_thesis_deletable` and `theses` policies to call
 *   the SECURITY DEFINER `kanon_org_role(org_id)` helper so `memberships` RLS never recurses.
 * - Adds SECURITY DEFINER helpers for bootstrap/cross-boundary flows:
 *   - `kanon_create_organization`: atomic org + owner membership insert gated on caller uid.
 *   - `kanon_accept_invitation`: atomic invite claim + membership upsert (blocks role tampering).
 *   - `kanon_ticker_restricted`: fail-closed compliance check even after a user leaves an org.
 */
const THESES_ORG_WRITE_CHECK = `
  (user_id = kanon_rls_uid() AND (org_id IS NULL OR kanon_org_role(org_id) IN ('owner', 'pm', 'analyst')))
  OR (org_id IS NOT NULL AND kanon_org_role(org_id) IN ('owner', 'pm', 'analyst'))`;

export const KANON_WAVE_V2_STAGE6B_ORG_RLS_SQL = `
CREATE OR REPLACE FUNCTION kanon_thesis_writable(tid text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM theses t
    WHERE t.id = tid AND (
      t.user_id = kanon_rls_uid()
      OR (t.org_id IS NOT NULL AND kanon_org_role(t.org_id) IN ('owner', 'pm', 'analyst'))
    )
  )
$$;

CREATE OR REPLACE FUNCTION kanon_thesis_deletable(tid text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM theses t
    WHERE t.id = tid AND (
      t.user_id = kanon_rls_uid()
      OR (t.org_id IS NOT NULL AND kanon_org_role(t.org_id) = 'owner')
    )
  )
$$;

DROP POLICY IF EXISTS kanon_rls_theses_select ON theses;
CREATE POLICY kanon_rls_theses_select ON theses FOR SELECT USING (
  kanon_rls_is_system() OR kanon_rls_open()
  OR user_id = kanon_rls_uid()
  OR (org_id IS NOT NULL AND kanon_org_role(org_id) IS NOT NULL)
);

DROP POLICY IF EXISTS kanon_rls_theses_update ON theses;
CREATE POLICY kanon_rls_theses_update ON theses FOR UPDATE
  USING (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(id))
  WITH CHECK (kanon_rls_is_system() OR kanon_rls_open() OR ${THESES_ORG_WRITE_CHECK});

CREATE OR REPLACE FUNCTION kanon_create_organization(
  id_ text,
  name_ text,
  slug_ text,
  creator_uid_ text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (kanon_rls_is_system() OR kanon_rls_open() OR creator_uid_ = kanon_rls_uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'RLS_FORBIDDEN_ORG_CREATOR' USING ERRCODE = '42501';
  END IF;
  INSERT INTO organizations (id, name, slug, created_by)
  VALUES (id_, name_, slug_, creator_uid_);
  INSERT INTO memberships (org_id, user_id, role, accepted_at)
  VALUES (id_, creator_uid_, 'owner', NOW());
END $$;

CREATE OR REPLACE FUNCTION kanon_accept_invitation(
  uid_ text,
  inv_id_ text,
  token_hash_ text
) RETURNS TABLE(out_status text, out_invitation_id text, out_org_id text, out_role text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  inv org_invitations%ROWTYPE;
  inviter_role text;
BEGIN
  IF (kanon_rls_is_system() OR kanon_rls_open() OR uid_ = kanon_rls_uid()) IS NOT TRUE THEN
    RETURN QUERY SELECT 'FORBIDDEN'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF token_hash_ IS NOT NULL THEN
    SELECT * INTO inv FROM org_invitations oi WHERE oi.token_hash = token_hash_ FOR UPDATE;
  ELSIF inv_id_ IS NOT NULL THEN
    SELECT * INTO inv FROM org_invitations oi WHERE oi.id = inv_id_ AND oi.invitee_user_id = uid_ FOR UPDATE;
  ELSE
    RETURN QUERY SELECT 'MISSING_CREDENTIAL'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF inv.invitee_user_id IS NOT NULL AND inv.invitee_user_id <> uid_ THEN
    RETURN QUERY SELECT 'FORBIDDEN'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF inv.accepted_at IS NOT NULL OR inv.revoked_at IS NOT NULL OR inv.expires_at <= NOW() THEN
    RETURN QUERY SELECT 'EXPIRED_OR_USED'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  SELECT m.role INTO inviter_role FROM memberships m
  WHERE m.org_id = inv.org_id AND m.user_id = inv.invited_by AND m.accepted_at IS NOT NULL
  LIMIT 1;
  IF inviter_role IS DISTINCT FROM 'owner' THEN
    RETURN QUERY SELECT 'INVITER_REVOKED'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  UPDATE org_invitations SET accepted_at = NOW()
  WHERE id = inv.id AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'EXPIRED_OR_USED'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  INSERT INTO memberships (org_id, user_id, role, accepted_at)
  VALUES (inv.org_id, uid_, inv.role, NOW())
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, accepted_at = EXCLUDED.accepted_at;
  RETURN QUERY SELECT 'OK'::text, inv.id, inv.org_id, inv.role;
END $$;

CREATE OR REPLACE FUNCTION kanon_ticker_restricted(
  oid_ text,
  tickers_ text[],
  as_of_ timestamptz DEFAULT NOW()
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM restricted_list r
    WHERE r.org_id = oid_
      AND r.ticker = ANY(tickers_)
      AND (r.expires_at IS NULL OR r.expires_at >= as_of_)
  )
$$;

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_memberships_select ON memberships;
DROP POLICY IF EXISTS kanon_rls_memberships_write ON memberships;
CREATE POLICY kanon_rls_memberships_select ON memberships FOR SELECT USING (
  kanon_rls_is_system() OR kanon_rls_open()
  OR user_id = kanon_rls_uid()
  OR kanon_org_role(org_id) IS NOT NULL
);
CREATE POLICY kanon_rls_memberships_write ON memberships FOR ALL USING (
  kanon_rls_is_system() OR kanon_rls_open() OR kanon_org_role(org_id) = 'owner'
) WITH CHECK (
  kanon_rls_is_system() OR kanon_rls_open() OR kanon_org_role(org_id) = 'owner'
);

ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_org_invitations_select ON org_invitations;
DROP POLICY IF EXISTS kanon_rls_org_invitations_write ON org_invitations;
CREATE POLICY kanon_rls_org_invitations_select ON org_invitations FOR SELECT USING (
  kanon_rls_is_system() OR kanon_rls_open()
  OR invitee_user_id = kanon_rls_uid()
  OR kanon_org_role(org_id) IN ('owner', 'pm')
);
CREATE POLICY kanon_rls_org_invitations_write ON org_invitations FOR ALL USING (
  kanon_rls_is_system() OR kanon_rls_open() OR kanon_org_role(org_id) IN ('owner', 'pm')
) WITH CHECK (
  kanon_rls_is_system() OR kanon_rls_open() OR kanon_org_role(org_id) IN ('owner', 'pm')
);

ALTER TABLE restricted_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE restricted_list FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_restricted_list_select ON restricted_list;
DROP POLICY IF EXISTS kanon_rls_restricted_list_write ON restricted_list;
CREATE POLICY kanon_rls_restricted_list_select ON restricted_list FOR SELECT USING (
  kanon_rls_is_system() OR kanon_rls_open() OR kanon_org_role(org_id) IS NOT NULL
);
CREATE POLICY kanon_rls_restricted_list_write ON restricted_list FOR ALL USING (
  kanon_rls_is_system() OR kanon_rls_open() OR kanon_org_role(org_id) IN ('owner', 'compliance')
) WITH CHECK (
  kanon_rls_is_system() OR kanon_rls_open() OR kanon_org_role(org_id) IN ('owner', 'compliance')
);

REVOKE ALL ON FUNCTION
  kanon_audit_chain_tail(),
  kanon_create_organization(text, text, text, text),
  kanon_accept_invitation(text, text, text),
  kanon_ticker_restricted(text, text[], timestamptz)
FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanon_app') THEN
    GRANT EXECUTE ON FUNCTION
      kanon_org_role(text),
      kanon_audit_chain_tail(),
      kanon_create_organization(text, text, text, text),
      kanon_accept_invitation(text, text, text),
      kanon_ticker_restricted(text, text[], timestamptz)
    TO kanon_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanon_app_local') THEN
    GRANT EXECUTE ON FUNCTION
      kanon_org_role(text),
      kanon_audit_chain_tail(),
      kanon_create_organization(text, text, text, text),
      kanon_accept_invitation(text, text, text),
      kanon_ticker_restricted(text, text[], timestamptz)
    TO kanon_app_local;
  END IF;
END $$;
`;
