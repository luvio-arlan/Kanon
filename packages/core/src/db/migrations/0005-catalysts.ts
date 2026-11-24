export const KANON_CATALYSTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS thesis_catalysts (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date_label TEXT NOT NULL,
  category TEXT NOT NULL,
  impact TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming',
  verification_metric TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thesis_catalysts_thesis_id ON thesis_catalysts(thesis_id);
`;
