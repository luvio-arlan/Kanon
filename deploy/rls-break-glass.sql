-- Emergency break-glass rollback for KANON RLS Phase D (migration 0028).
-- NEVER include this file in KANON_MIGRATIONS.
-- Execute ONLY as database owner during an active production outage, then follow up
-- with a formal forward migration and an entry in `.rules/postmortems.md`.
CREATE OR REPLACE FUNCTION kanon_rls_open() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT kanon_rls_uid() IS NULL $$;
