export const KANON_USER_SEC_OVERRIDES_SQL = `
CREATE TABLE IF NOT EXISTS user_sec_overrides (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  cik TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  reporting_currency TEXT NOT NULL DEFAULT 'USD',
  fx_to_usd DOUBLE PRECISION NOT NULL DEFAULT 1,
  adr_ratio DOUBLE PRECISION NOT NULL DEFAULT 1,
  facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  annuals JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_user_sec_overrides_user
  ON user_sec_overrides (user_id);
`;
