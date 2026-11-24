import { DEFAULT_WORKSPACE_USER_ID, DEMO_ACCOUNT_PHONE_E164 } from "../../contracts/auth-contracts";

export const KANON_ACCOUNTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone_e164 TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  last_login_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions (expires_at);

INSERT INTO users (id, phone_e164, display_name, password_hash, role)
VALUES (
  '${DEFAULT_WORKSPACE_USER_ID}',
  '${DEMO_ACCOUNT_PHONE_E164}',
  'KANON 演示空间',
  'demo-locked-account',
  'demo'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE theses
  ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '${DEFAULT_WORKSPACE_USER_ID}';

ALTER TABLE theses
  DROP CONSTRAINT IF EXISTS theses_ticker_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_theses_user_ticker
  ON theses (user_id, ticker);

CREATE INDEX IF NOT EXISTS idx_theses_user_order
  ON theses (user_id, index_order);
`;
