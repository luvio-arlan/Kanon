/**
 * Expand-only migration 0031 (Wave W4 — R3 Management Guidance Credibility Ledger):
 * Adds `guidance_commitments` with HITL CHECK constraints, thesis-child RLS,
 * and idempotent backfill of legacy `guidance_log` notes into `draft_legacy`.
 */
export const KANON_GUIDANCE_LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS guidance_commitments (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  security_id TEXT REFERENCES securities(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('revenue', 'gross_margin', 'operating_margin', 'diluted_eps',
    'capex', 'operating_expenses', 'free_cash_flow', 'custom')),
  custom_label TEXT,
  basis TEXT NOT NULL DEFAULT 'unspecified' CHECK (basis IN ('gaap', 'non_gaap', 'unspecified')),
  unit TEXT CHECK (unit IN ('usd', 'pct', 'usd_per_share')),
  currency TEXT NOT NULL DEFAULT 'USD',
  target_fiscal_year INTEGER,
  target_fiscal_period TEXT CHECK (target_fiscal_period IN ('FY', 'Q1', 'Q2', 'Q3', 'Q4')),
  target_period_end TEXT,
  issued_on TEXT NOT NULL,
  low DOUBLE PRECISION,
  high DOUBLE PRECISION,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('filing_chunk', 'research_note', 'manual')),
  source_ref TEXT,
  source_url TEXT,
  quote TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft_ai', 'draft_legacy', 'confirmed', 'withdrawn', 'superseded')),
  supersedes_id TEXT REFERENCES guidance_commitments(id) ON DELETE SET NULL,
  extraction_json JSONB,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  actual_value DOUBLE PRECISION,
  actual_source_json JSONB,
  outcome TEXT CHECK (outcome IN ('beat', 'in_line', 'miss', 'unresolvable')),
  surprise DOUBLE PRECISION,
  resolved_at TIMESTAMPTZ,
  resolution_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (low IS NULL OR high IS NULL OR low <= high),
  CHECK (status <> 'confirmed' OR (unit IS NOT NULL AND target_fiscal_year IS NOT NULL
    AND target_fiscal_period IS NOT NULL AND (low IS NOT NULL OR high IS NOT NULL)
    AND confirmed_by IS NOT NULL AND length(quote) >= 12))
);

CREATE INDEX IF NOT EXISTS idx_guidance_thesis_period
  ON guidance_commitments (thesis_id, metric, target_fiscal_year, target_fiscal_period);

ALTER TABLE guidance_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_commitments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_guidance_commitments_select ON guidance_commitments;
DROP POLICY IF EXISTS kanon_rls_guidance_commitments_write ON guidance_commitments;
CREATE POLICY kanon_rls_guidance_commitments_select ON guidance_commitments FOR SELECT
  USING (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_readable(thesis_id));
CREATE POLICY kanon_rls_guidance_commitments_write ON guidance_commitments FOR ALL
  USING (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(thesis_id))
  WITH CHECK (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(thesis_id));

INSERT INTO guidance_commitments (id, thesis_id, created_by, metric, custom_label, issued_on,
  source_kind, source_ref, quote, status)
SELECT 'gc_legacy_' || n.id, n.thesis_id, n.user_id, 'custom', left(n.guidance_metric, 60),
  to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), 'research_note', n.id,
  left(trim(n.guidance_promised || ' / ' || n.guidance_delivered), 600), 'draft_legacy'
FROM research_notes n
WHERE n.kind = 'guidance_log' AND (n.guidance_metric <> '' OR n.guidance_promised <> '')
ON CONFLICT (id) DO NOTHING;
`;
