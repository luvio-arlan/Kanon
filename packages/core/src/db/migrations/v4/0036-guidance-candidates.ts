/**
 * Migration 0036 · Wave U1-2 R3b 8-K Ex-99.1 Press Release Guidance Candidates (HITL).
 * Public security-level derived candidates (read-all, system-write RLS) + tenant adoption link on guidance_commitments.
 */
export const KANON_WAVE_U1_GUIDANCE_CANDIDATES_SQL = `
CREATE TABLE IF NOT EXISTS guidance_candidates (
  id TEXT PRIMARY KEY,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  accession TEXT NOT NULL REFERENCES filings(accession) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'revenue', 'gross_margin', 'operating_margin', 'diluted_eps',
    'capex', 'operating_expenses', 'free_cash_flow', 'custom'
  )),
  basis TEXT NOT NULL CHECK (basis IN ('gaap', 'non_gaap', 'unspecified')),
  unit TEXT NOT NULL CHECK (unit IN ('usd', 'pct', 'usd_per_share')),
  currency TEXT NOT NULL DEFAULT 'USD',
  target_fiscal_year INTEGER NOT NULL,
  target_fiscal_period TEXT NOT NULL CHECK (target_fiscal_period IN ('FY', 'Q1', 'Q2', 'Q3', 'Q4')),
  low DOUBLE PRECISION,
  high DOUBLE PRECISION,
  quote TEXT NOT NULL CHECK (length(quote) >= 12),
  extractor TEXT NOT NULL CHECK (extractor IN ('rule/1', 'llm/1')),
  issued_on TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (low IS NOT NULL OR high IS NOT NULL),
  CHECK (low IS NULL OR high IS NULL OR low <= high)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guidance_candidates_dedupe
  ON guidance_candidates (accession, metric, target_fiscal_year, target_fiscal_period, basis);

ALTER TABLE guidance_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_candidates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_guidance_candidates_read ON guidance_candidates;
CREATE POLICY kanon_rls_guidance_candidates_read ON guidance_candidates
  FOR SELECT USING (true);
DROP POLICY IF EXISTS kanon_rls_guidance_candidates_write ON guidance_candidates;
CREATE POLICY kanon_rls_guidance_candidates_write ON guidance_candidates
  FOR ALL USING (kanon_rls_is_system()) WITH CHECK (kanon_rls_is_system());

ALTER TABLE guidance_commitments ADD COLUMN IF NOT EXISTS candidate_id TEXT
  REFERENCES guidance_candidates(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guidance_commit_candidate
  ON guidance_commitments (thesis_id, candidate_id) WHERE candidate_id IS NOT NULL;
`;
