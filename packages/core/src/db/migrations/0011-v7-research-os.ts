export const KANON_V7_RESEARCH_OS_SQL = `
ALTER TABLE hypotheses ADD COLUMN IF NOT EXISTS kpi_rule JSONB;

ALTER TABLE discipline_entries ADD COLUMN IF NOT EXISTS weight_delta_pct DOUBLE PRECISION;
ALTER TABLE discipline_entries ADD COLUMN IF NOT EXISTS benchmark_price DOUBLE PRECISION;

ALTER TABLE sec_filings_cache ADD COLUMN IF NOT EXISTS reporting_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE sec_filings_cache ADD COLUMN IF NOT EXISTS fx_to_usd DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE sec_filings_cache ADD COLUMN IF NOT EXISTS adr_ratio DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE sec_filings_cache ADD COLUMN IF NOT EXISTS insider_summary JSONB;

CREATE TABLE IF NOT EXISTS research_notes (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'earnings_call',
  period_label TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  guidance_metric TEXT NOT NULL DEFAULT '',
  guidance_promised TEXT NOT NULL DEFAULT '',
  guidance_delivered TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_notes_thesis
  ON research_notes (thesis_id, updated_at DESC);
`;
