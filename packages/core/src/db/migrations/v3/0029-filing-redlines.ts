/**
 * Expand-only migration 0029 (Wave W4 — R1 Filing Redlines):
 * Adds `filing_redlines` (public derived RLS), `filing_chunks.norm_hash` / `extract_version`,
 * and section ordering index.
 */
export const KANON_FILING_REDLINES_SQL = `
CREATE TABLE IF NOT EXISTS filing_redlines (
  current_accession TEXT NOT NULL REFERENCES filings(accession) ON DELETE CASCADE,
  previous_accession TEXT NOT NULL REFERENCES filings(accession) ON DELETE CASCADE,
  section_code TEXT NOT NULL CHECK (section_code IN ('risk_factors', 'mda')),
  algo_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'section_missing', 'too_large', 'failed')),
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  changes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (current_accession, previous_accession, section_code, algo_version)
);

ALTER TABLE filing_chunks ADD COLUMN IF NOT EXISTS norm_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE filing_chunks ADD COLUMN IF NOT EXISTS extract_version TEXT NOT NULL DEFAULT 'reader/1';
CREATE INDEX IF NOT EXISTS idx_filing_chunks_accession_section
  ON filing_chunks (accession, section_code, para_index);

ALTER TABLE filing_redlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE filing_redlines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_filing_redlines_read ON filing_redlines;
DROP POLICY IF EXISTS kanon_rls_filing_redlines_write ON filing_redlines;
CREATE POLICY kanon_rls_filing_redlines_read ON filing_redlines FOR SELECT USING (true);
CREATE POLICY kanon_rls_filing_redlines_write ON filing_redlines FOR ALL
  USING (kanon_rls_is_system()) WITH CHECK (kanon_rls_is_system());
`;
