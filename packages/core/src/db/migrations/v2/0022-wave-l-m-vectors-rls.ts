/**
 * Expand-only migration 0022 (Waves L & M):
 * - L2: Adds incremental `content_hash` + portable `embedding_json` to `filing_chunks`
 *       (plus safe best-effort pgvector extension check on Postgres).
 * - M2: Enables non-breaking Row-Level Security (RLS) policies gated on session-local
 *       `kanon.current_user_id` across tenant tables (`theses`, `portfolio_accounts`,
 *       `forecasts`, `inbox_items`, `user_ai_credentials`).
 */
export const KANON_WAVE_L_M_VECTORS_RLS_SQL = `
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

ALTER TABLE filing_chunks ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE filing_chunks ADD COLUMN IF NOT EXISTS embedding_json JSONB;
CREATE INDEX IF NOT EXISTS idx_filing_chunks_hash ON filing_chunks (ticker, content_hash);

ALTER TABLE theses ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'theses' AND policyname = 'kanon_rls_theses') THEN
    CREATE POLICY kanon_rls_theses ON theses
      USING (
        NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
        OR user_id = current_setting('kanon.current_user_id', true)
        OR (
          org_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM memberships m
            WHERE m.org_id = theses.org_id
              AND m.user_id = current_setting('kanon.current_user_id', true)
          )
        )
      );
  END IF;
END;
$$;

ALTER TABLE portfolio_accounts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portfolio_accounts' AND policyname = 'kanon_rls_portfolio_accounts') THEN
    CREATE POLICY kanon_rls_portfolio_accounts ON portfolio_accounts
      USING (
        NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
        OR user_id = current_setting('kanon.current_user_id', true)
      );
  END IF;
END;
$$;

ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'forecasts' AND policyname = 'kanon_rls_forecasts') THEN
    CREATE POLICY kanon_rls_forecasts ON forecasts
      USING (
        NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
        OR user_id = current_setting('kanon.current_user_id', true)
      );
  END IF;
END;
$$;

ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_items' AND policyname = 'kanon_rls_inbox_items') THEN
    CREATE POLICY kanon_rls_inbox_items ON inbox_items
      USING (
        NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
        OR user_id = current_setting('kanon.current_user_id', true)
      );
  END IF;
END;
$$;

ALTER TABLE user_ai_credentials ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_ai_credentials' AND policyname = 'kanon_rls_user_ai_credentials') THEN
    CREATE POLICY kanon_rls_user_ai_credentials ON user_ai_credentials
      USING (
        NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
        OR user_id = current_setting('kanon.current_user_id', true)
      );
  END IF;
END;
$$;
`;
