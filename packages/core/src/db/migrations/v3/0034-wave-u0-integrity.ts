/**
 * Expand-only migration 0034 (Wave U · U0 Integrity):
 * - Segment reports: persist `profit_reconciled` and `period_kind` (annual vs quarter)
 * - Guidance commitments: reset `pit/1` resolutions, require basis on confirmed EPS/margins,
 *   freeze resolved commitments against tenant UPDATE (allowing CASCADE DELETE)
 * - Decision attribution RLS: allow snapshot holders to read hypothesis events after thesis deletion,
 *   require readable thesis on snapshot INSERT
 * - Portfolio accounts: flag legacy non-USD or non-US-suffix accounts as `ledger_inconsistent`
 */
export const KANON_WAVE_U0_INTEGRITY_SQL = `
ALTER TABLE segment_reports ADD COLUMN IF NOT EXISTS profit_reconciled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE segment_reports ADD COLUMN IF NOT EXISTS period_kind TEXT NOT NULL DEFAULT 'annual'
  CHECK (period_kind IN ('annual', 'quarter'));
UPDATE segment_reports SET period_kind = 'quarter' WHERE form LIKE '10-Q%';

UPDATE guidance_commitments
SET outcome = NULL,
    surprise = NULL,
    actual_value = NULL,
    actual_source_json = NULL,
    resolved_at = NULL,
    resolution_version = NULL,
    target_period_end = NULL,
    updated_at = NOW()
WHERE resolution_version = 'pit/1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_guidance_basis_required'
  ) THEN
    ALTER TABLE guidance_commitments ADD CONSTRAINT chk_guidance_basis_required CHECK (
      status <> 'confirmed'
      OR metric NOT IN ('diluted_eps', 'gross_margin', 'operating_margin')
      OR basis <> 'unspecified'
    ) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION kanon_guard_resolved_guidance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.resolved_at IS NOT NULL AND NOT kanon_rls_is_system() AND (
       NEW.low IS DISTINCT FROM OLD.low OR NEW.high IS DISTINCT FROM OLD.high
    OR NEW.unit IS DISTINCT FROM OLD.unit OR NEW.basis IS DISTINCT FROM OLD.basis
    OR NEW.target_fiscal_year IS DISTINCT FROM OLD.target_fiscal_year
    OR NEW.target_fiscal_period IS DISTINCT FROM OLD.target_fiscal_period
    OR NEW.status IS DISTINCT FROM OLD.status OR NEW.outcome IS DISTINCT FROM OLD.outcome) THEN
    RAISE EXCEPTION 'Resolved guidance commitment % is frozen', OLD.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guidance_resolved_frozen ON guidance_commitments;
CREATE TRIGGER trg_guidance_resolved_frozen BEFORE UPDATE ON guidance_commitments
  FOR EACH ROW EXECUTE FUNCTION kanon_guard_resolved_guidance();

DROP POLICY IF EXISTS kanon_hyp_events_select ON hypothesis_status_events;
CREATE POLICY kanon_hyp_events_select ON hypothesis_status_events FOR SELECT USING (
  kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_readable(thesis_id)
  OR EXISTS (
    SELECT 1 FROM decision_snapshots ds
    WHERE ds.thesis_id = hypothesis_status_events.thesis_id AND ds.user_id = kanon_rls_uid()
  )
);

DROP POLICY IF EXISTS kanon_decision_snapshots_insert ON decision_snapshots;
CREATE POLICY kanon_decision_snapshots_insert ON decision_snapshots FOR INSERT WITH CHECK (
  kanon_rls_is_system() OR kanon_rls_open()
  OR (user_id = kanon_rls_uid() AND kanon_thesis_readable(thesis_id))
);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_thesis_user
  ON decision_snapshots (thesis_id, user_id);

UPDATE portfolio_accounts SET ledger_inconsistent = TRUE
WHERE base_currency <> 'USD'
   OR id IN (
     SELECT account_id FROM transactions
     WHERE ticker ~ '\\.(HK|SS|SZ|T|L|PA|DE|AS|SW|TO|AX|TW|KS)$'
   );
`;
