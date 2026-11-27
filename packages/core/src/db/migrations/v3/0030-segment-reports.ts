/**
 * Expand-only migration 0030 (Wave W4 — R2 SEC Segment Reports):
 * Adds `segment_reports` and `segment_lines` with public-read / system-write RLS.
 */
export const KANON_SEGMENT_REPORTS_SQL = `
CREATE TABLE IF NOT EXISTS segment_reports (
  id TEXT PRIMARY KEY,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  accession TEXT NOT NULL REFERENCES filings(accession) ON DELETE CASCADE,
  form TEXT NOT NULL,
  axis TEXT NOT NULL CHECK (axis IN ('business', 'geography', 'product')),
  axis_qname TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  fiscal_period TEXT,
  currency TEXT NOT NULL,
  revenue_concept TEXT NOT NULL,
  profit_concept TEXT,
  profit_is_standard BOOLEAN NOT NULL DEFAULT FALSE,
  consolidated_revenue DOUBLE PRECISION,
  segment_revenue_sum DOUBLE PRECISION,
  diff_pct DOUBLE PRECISION,
  status TEXT NOT NULL CHECK (status IN ('reconciled', 'unreconciled', 'single_segment',
    'no_dimensional_data', 'parse_failed', 'too_large')),
  filed_at TEXT NOT NULL,
  algo_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segment_reports_security_period
  ON segment_reports (security_id, axis, period_end, filed_at);

CREATE TABLE IF NOT EXISTS segment_lines (
  report_id TEXT NOT NULL REFERENCES segment_reports(id) ON DELETE CASCADE,
  member_qname TEXT NOT NULL,
  label TEXT NOT NULL,
  label_source TEXT NOT NULL CHECK (label_source IN ('label_linkbase', 'qname')),
  line_kind TEXT NOT NULL CHECK (line_kind IN ('segment', 'elimination', 'corporate', 'reconciling')),
  revenue DOUBLE PRECISION,
  operating_income DOUBLE PRECISION,
  PRIMARY KEY (report_id, member_qname)
);

ALTER TABLE segment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_segment_reports_read ON segment_reports;
DROP POLICY IF EXISTS kanon_rls_segment_reports_write ON segment_reports;
CREATE POLICY kanon_rls_segment_reports_read ON segment_reports FOR SELECT USING (true);
CREATE POLICY kanon_rls_segment_reports_write ON segment_reports FOR ALL
  USING (kanon_rls_is_system()) WITH CHECK (kanon_rls_is_system());

ALTER TABLE segment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_segment_lines_read ON segment_lines;
DROP POLICY IF EXISTS kanon_rls_segment_lines_write ON segment_lines;
CREATE POLICY kanon_rls_segment_lines_read ON segment_lines FOR SELECT USING (true);
CREATE POLICY kanon_rls_segment_lines_write ON segment_lines FOR ALL
  USING (kanon_rls_is_system()) WITH CHECK (kanon_rls_is_system());
`;
