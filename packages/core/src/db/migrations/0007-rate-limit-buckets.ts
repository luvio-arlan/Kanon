export const KANON_RATE_LIMIT_BUCKETS_SQL = `
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset_at ON rate_limit_buckets (reset_at);
`;
