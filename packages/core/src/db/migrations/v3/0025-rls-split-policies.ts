/**
 * Expand-only migration 0025 (Wave Q1):
 * - Splits `theses` RLS into SELECT (all accepted org members + owner) vs WRITE (owner/pm/analyst).
 * - Adds tenant-scoped RLS + FORCE ROW LEVEL SECURITY on thesis & ledger child tables.
 */
export const KANON_RLS_SPLIT_POLICIES_SQL = `
DROP POLICY IF EXISTS kanon_rls_theses ON theses;
DROP POLICY IF EXISTS kanon_rls_theses_select ON theses;
DROP POLICY IF EXISTS kanon_rls_theses_write ON theses;

CREATE POLICY kanon_rls_theses_select ON theses
  FOR SELECT
  USING (
    current_setting('kanon.system', true) = 'on'
    OR NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
    OR user_id = current_setting('kanon.current_user_id', true)
    OR (
      org_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.org_id = theses.org_id
          AND m.user_id = current_setting('kanon.current_user_id', true)
          AND m.accepted_at IS NOT NULL
      )
    )
  );

CREATE POLICY kanon_rls_theses_write ON theses
  FOR ALL
  USING (
    current_setting('kanon.system', true) = 'on'
    OR NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
    OR user_id = current_setting('kanon.current_user_id', true)
    OR (
      org_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.org_id = theses.org_id
          AND m.user_id = current_setting('kanon.current_user_id', true)
          AND m.accepted_at IS NOT NULL
          AND m.role IN ('owner', 'pm', 'analyst')
      )
    )
  )
  WITH CHECK (
    current_setting('kanon.system', true) = 'on'
    OR NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
    OR user_id = current_setting('kanon.current_user_id', true)
    OR (
      org_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.org_id = theses.org_id
          AND m.user_id = current_setting('kanon.current_user_id', true)
          AND m.accepted_at IS NOT NULL
          AND m.role IN ('owner', 'pm', 'analyst')
      )
    )
  );

ALTER TABLE hypotheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypotheses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_hypotheses ON hypotheses;
CREATE POLICY kanon_rls_hypotheses ON hypotheses
  USING (
    current_setting('kanon.system', true) = 'on'
    OR NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
    OR EXISTS (SELECT 1 FROM theses t WHERE t.id = hypotheses.thesis_id)
  );

ALTER TABLE valuation_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_scenarios FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_valuation_scenarios ON valuation_scenarios;
CREATE POLICY kanon_rls_valuation_scenarios ON valuation_scenarios
  USING (
    current_setting('kanon.system', true) = 'on'
    OR NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
    OR EXISTS (SELECT 1 FROM theses t WHERE t.id = valuation_scenarios.thesis_id)
  );

ALTER TABLE discipline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE discipline_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_discipline_entries ON discipline_entries;
CREATE POLICY kanon_rls_discipline_entries ON discipline_entries
  USING (
    current_setting('kanon.system', true) = 'on'
    OR NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
    OR EXISTS (SELECT 1 FROM theses t WHERE t.id = discipline_entries.thesis_id)
  );

ALTER TABLE research_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_research_notes ON research_notes;
CREATE POLICY kanon_rls_research_notes ON research_notes
  USING (
    current_setting('kanon.system', true) = 'on'
    OR NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
    OR EXISTS (SELECT 1 FROM theses t WHERE t.id = research_notes.thesis_id)
  );

ALTER TABLE ic_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ic_approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_ic_approvals ON ic_approvals;
CREATE POLICY kanon_rls_ic_approvals ON ic_approvals
  USING (
    current_setting('kanon.system', true) = 'on'
    OR NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
    OR EXISTS (SELECT 1 FROM theses t WHERE t.id = ic_approvals.thesis_id)
  );

ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_lots ON lots;
CREATE POLICY kanon_rls_lots ON lots
  USING (
    current_setting('kanon.system', true) = 'on'
    OR NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
    OR user_id = current_setting('kanon.current_user_id', true)
  );

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_transactions ON transactions;
CREATE POLICY kanon_rls_transactions ON transactions
  USING (
    current_setting('kanon.system', true) = 'on'
    OR NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL
    OR user_id = current_setting('kanon.current_user_id', true)
  );
`;
