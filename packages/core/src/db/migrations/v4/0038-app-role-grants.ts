/**
 * Migration 0038 · Wave V0-1 production NOBYPASSRLS application role grants.
 * Conditional: no-op until an operator provisions `kanon_app` via `deploy/rls-provision-app-role.sql`.
 * Default privileges make every future table, sequence and function reachable without manual grants.
 */
export const KANON_WAVE_V0_APP_ROLE_GRANTS_SQL = `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanon_app') THEN
    GRANT USAGE ON SCHEMA public TO kanon_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kanon_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kanon_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kanon_app;
    REVOKE UPDATE, DELETE ON audit_log FROM kanon_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kanon_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kanon_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO kanon_app;
  END IF;
END $$;
`;
