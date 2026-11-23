export const KANON_POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS theses (
  id TEXT PRIMARY KEY,
  index_order INTEGER NOT NULL,
  ticker TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  sector_tag TEXT NOT NULL,
  current_price DOUBLE PRECISION NOT NULL,
  horizon_years INTEGER NOT NULL DEFAULT 3,
  conviction_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  business_filter JSONB NOT NULL,
  last_reviewed_label TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hypotheses (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  metric_label TEXT NOT NULL,
  threshold TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'watching',
  note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cross_checks (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  peer_company TEXT NOT NULL,
  peer_role TEXT NOT NULL,
  topic TEXT NOT NULL,
  source_anchor TEXT NOT NULL,
  statement TEXT NOT NULL,
  alignment TEXT NOT NULL DEFAULT 'pending',
  takeaway TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS valuation_scenarios (
  thesis_id TEXT PRIMARY KEY REFERENCES theses(id) ON DELETE CASCADE,
  bear_eps DOUBLE PRECISION NOT NULL,
  bear_pe DOUBLE PRECISION NOT NULL,
  bear_prob DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  base_eps DOUBLE PRECISION NOT NULL,
  base_pe DOUBLE PRECISION NOT NULL,
  base_prob DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  bull_eps DOUBLE PRECISION NOT NULL,
  bull_pe DOUBLE PRECISION NOT NULL,
  bull_prob DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  price_history JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS discipline_entries (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  no_leverage_confirmed BOOLEAN NOT NULL,
  position_cap_confirmed BOOLEAN NOT NULL,
  exit_rule TEXT NOT NULL,
  emotion TEXT NOT NULL,
  price_anchor DOUBLE PRECISION NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS glossary_terms (
  term TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  category TEXT NOT NULL,
  plain_summary TEXT NOT NULL,
  filing_context TEXT NOT NULL,
  example TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sec_filings_cache (
  ticker TEXT PRIMARY KEY,
  cik TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  source TEXT NOT NULL,
  filings JSONB NOT NULL,
  facts JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
