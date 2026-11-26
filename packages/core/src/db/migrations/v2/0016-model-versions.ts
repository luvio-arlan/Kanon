export const KANON_MODEL_VERSIONS_SQL = `
CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  version_num INTEGER NOT NULL,
  label TEXT NOT NULL,
  model_kind TEXT NOT NULL DEFAULT 'fcff_dcf',
  inputs_json JSONB NOT NULL,
  outputs_json JSONB NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_versions_thesis_num
  ON model_versions (thesis_id, version_num);
`;
