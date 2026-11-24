export const KANON_V4_MIGRATION_SQL = `
ALTER TABLE theses
  ADD COLUMN IF NOT EXISTS portfolio_role TEXT NOT NULL DEFAULT 'watchlist';
ALTER TABLE theses
  ADD COLUMN IF NOT EXISTS current_weight_pct DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE theses
  ADD COLUMN IF NOT EXISTS target_max_weight_pct DOUBLE PRECISION NOT NULL DEFAULT 15;
ALTER TABLE theses
  ADD COLUMN IF NOT EXISTS avg_cost_basis DOUBLE PRECISION;

ALTER TABLE cross_checks
  ADD COLUMN IF NOT EXISTS linked_thesis_id TEXT;

ALTER TABLE valuation_scenarios
  ADD COLUMN IF NOT EXISTS model_mode TEXT NOT NULL DEFAULT 'pe';
ALTER TABLE valuation_scenarios
  ADD COLUMN IF NOT EXISTS driver_inputs JSONB;

ALTER TABLE sec_filings_cache
  ADD COLUMN IF NOT EXISTS quarterlies JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE thesis_revisions
  ADD COLUMN IF NOT EXISTS snapshot_json JSONB;

CREATE TABLE IF NOT EXISTS quarterly_reviews (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  quarter_label TEXT NOT NULL,
  summary TEXT NOT NULL,
  hypothesis_verdicts JSONB NOT NULL,
  price_at_review DOUBLE PRECISION NOT NULL,
  base_target_at_review DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quarterly_reviews_thesis_created
  ON quarterly_reviews (thesis_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  fallback_reason TEXT,
  briefing_json JSONB NOT NULL,
  applied_proposal_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_thesis_created
  ON agent_runs (thesis_id, created_at DESC);
`;
