-- KANON Read-Only Production RLS & Role Verification Script (U0-10)
-- Execute in Neon SQL Editor or via psql against the pooled app connection and direct owner connection.

-- 1. Verify current connected role flags (app connection MUST have rolbypassrls = false, rolsuper = false)
SELECT
  current_user AS connected_role,
  r.rolbypassrls,
  r.rolsuper,
  kanon_rls_open() AS rls_open
FROM pg_roles r
WHERE r.rolname = current_user;

-- 2. Inspect active application sessions to confirm pooler uses kanon_app (NOBYPASSRLS)
SELECT usename, application_name, count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY usename, application_name
ORDER BY connections DESC;

-- 3. Verify all RLS-protected tables have both relrowsecurity = true and relforcerowsecurity = true
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
ORDER BY c.relname;

-- 4. Verify audit_log privileges for kanon_app (UPDATE and DELETE must be FALSE)
SELECT
  has_table_privilege('kanon_app', 'public.audit_log', 'SELECT') AS can_select,
  has_table_privilege('kanon_app', 'public.audit_log', 'INSERT') AS can_insert,
  has_table_privilege('kanon_app', 'public.audit_log', 'UPDATE') AS can_update,
  has_table_privilege('kanon_app', 'public.audit_log', 'DELETE') AS can_delete
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanon_app');
