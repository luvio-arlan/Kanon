export const KANON_FACTS_JOBS_CHUNKS_SQL = `
CREATE TABLE IF NOT EXISTS filings (
  accession TEXT PRIMARY KEY,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  cik TEXT NOT NULL,
  form TEXT NOT NULL,
  filed_at TEXT NOT NULL,
  period_end TEXT,
  fiscal_year INTEGER,
  fiscal_period TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  primary_doc_url TEXT NOT NULL,
  amends_accession TEXT,
  parse_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS financial_facts (
  id TEXT PRIMARY KEY,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  accession TEXT NOT NULL REFERENCES filings(accession) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  xbrl_tag TEXT NOT NULL,
  taxonomy TEXT NOT NULL DEFAULT 'us-gaap',
  period_start TEXT,
  period_end TEXT NOT NULL,
  duration TEXT NOT NULL,
  fiscal_year INTEGER,
  fiscal_period TEXT,
  value DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL DEFAULT 'USD',
  currency TEXT NOT NULL DEFAULT 'USD',
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  filed_at TEXT NOT NULL,
  is_latest_for_period BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_financial_facts_pit
  ON financial_facts (security_id, concept, period_end, filed_at);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  locked_by TEXT,
  locked_until TIMESTAMPTZ,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_run_at ON jobs (status, run_at);

CREATE TABLE IF NOT EXISTS filing_chunks (
  id TEXT PRIMARY KEY,
  accession TEXT NOT NULL REFERENCES filings(accession) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  section_code TEXT NOT NULL,
  para_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  char_start INTEGER NOT NULL DEFAULT 0,
  char_end INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_filing_chunks_ticker_sec ON filing_chunks (ticker, section_code);

CREATE TABLE IF NOT EXISTS thesis_peers (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'peer',
  added_by TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_thesis_peers_unique ON thesis_peers (thesis_id, ticker);

CREATE TABLE IF NOT EXISTS estimates_snapshots (
  id TEXT PRIMARY KEY,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  metric TEXT NOT NULL,
  fiscal_period TEXT NOT NULL,
  mean DOUBLE PRECISION,
  median DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  analyst_count INTEGER,
  as_of TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_estimates_sec_metric ON estimates_snapshots (security_id, metric, fiscal_period, as_of);
`;
