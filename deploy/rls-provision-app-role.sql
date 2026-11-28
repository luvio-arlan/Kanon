-- KANON production NOBYPASSRLS application role provisioning (Wave V0-1). Idempotent.
-- Run ONCE as the owner role via DATABASE_URL_MIGRATE, passing the password as a psql variable
-- (never commit it):
--   psql "$DATABASE_URL_MIGRATE" -v app_password="$KANON_APP_PASSWORD" -f deploy/rls-provision-app-role.sql
-- Then run `pnpm db:migrate` (migration 0038 grants table/sequence/function privileges + defaults),
-- point the pooled Vercel DATABASE_URL at kanon_app, redeploy, and confirm
-- `GET https://app.kanon.hk/api/health` reports `db.bypassRls: false` and `status: "healthy"`.

SELECT format(
  'CREATE ROLE kanon_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanon_app')
\gexec

-- Re-assert posture even if the role pre-existed with different attributes.
ALTER ROLE kanon_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

SELECT format('GRANT CONNECT ON DATABASE %I TO kanon_app', current_database())
\gexec
GRANT USAGE ON SCHEMA public TO kanon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kanon_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kanon_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kanon_app;
REVOKE UPDATE, DELETE ON audit_log FROM kanon_app;

-- Verify: must return rolbypassrls = false, rolsuper = false.
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'kanon_app';
