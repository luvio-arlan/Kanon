/**
 * Expand-only migration 0028 (Wave W3 — RLS Phase D):
 * Single-statement atomic flip of `kanon_rls_open()` from fail-open to fail-closed (`false`).
 * Emergency rollback lives in `deploy/rls-break-glass.sql` (outside KANON_MIGRATIONS).
 */
export const KANON_RLS_FAIL_CLOSED_SQL = `
CREATE OR REPLACE FUNCTION kanon_rls_open() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
`;
