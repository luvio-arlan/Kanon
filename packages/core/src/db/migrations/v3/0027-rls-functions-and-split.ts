/**
 * Expand-only migration 0027 (Wave W1 — RLS Phase B):
 * - Creates stable RLS predicate functions (`kanon_rls_is_system`, `kanon_rls_uid`,
 *   `kanon_rls_open`, `kanon_thesis_readable`, `kanon_thesis_writable`, `kanon_thesis_deletable`).
 * - `kanon_rls_open()` remains fail-open (`kanon_rls_uid() IS NULL`) until Phase D (`0028`).
 * - Enables + forces RLS and installs command-split policies across all 21 tenant tables.
 */

const USER_OWNED_TABLES = [
  "portfolio_accounts",
  "forecasts",
  "inbox_items",
  "user_ai_credentials",
  "lots",
  "transactions",
] as const;

const THESIS_CHILD_TABLES = [
  "hypotheses",
  "valuation_scenarios",
  "discipline_entries",
  "cross_checks",
  "thesis_catalysts",
  "thesis_revisions",
  "quarterly_reviews",
  "copilot_outputs",
  "agent_runs",
  "model_versions",
  "thesis_peers",
  "ic_approvals",
] as const;

function buildUserOwnedPolicySql(table: string): string {
  const pred = "kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid()";
  return `
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_${table} ON ${table};
DROP POLICY IF EXISTS kanon_rls_${table}_select ON ${table};
DROP POLICY IF EXISTS kanon_rls_${table}_write ON ${table};
CREATE POLICY kanon_rls_${table}_select ON ${table} FOR SELECT USING (${pred});
CREATE POLICY kanon_rls_${table}_write ON ${table} FOR ALL USING (${pred}) WITH CHECK (${pred});`;
}

function buildThesisChildPolicySql(table: string): string {
  const readPred = "kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_readable(thesis_id)";
  const writePred = "kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(thesis_id)";
  return `
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_${table} ON ${table};
DROP POLICY IF EXISTS kanon_rls_${table}_select ON ${table};
DROP POLICY IF EXISTS kanon_rls_${table}_write ON ${table};
CREATE POLICY kanon_rls_${table}_select ON ${table} FOR SELECT USING (${readPred});
CREATE POLICY kanon_rls_${table}_write ON ${table} FOR ALL USING (${writePred}) WITH CHECK (${writePred});`;
}

const THESES_ORG_WRITE_CHECK = `
  (user_id = kanon_rls_uid() AND (org_id IS NULL OR EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.org_id = theses.org_id AND m.user_id = kanon_rls_uid()
      AND m.accepted_at IS NOT NULL AND m.role IN ('owner', 'pm', 'analyst')
  )))
  OR (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.org_id = theses.org_id AND m.user_id = kanon_rls_uid()
      AND m.accepted_at IS NOT NULL AND m.role IN ('owner', 'pm', 'analyst')
  ))`;

export const KANON_RLS_FUNCTIONS_AND_SPLIT_SQL = `
CREATE OR REPLACE FUNCTION kanon_rls_is_system() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('kanon.system', true), '') = 'on' $$;

CREATE OR REPLACE FUNCTION kanon_rls_uid() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('kanon.current_user_id', true), '') $$;

CREATE OR REPLACE FUNCTION kanon_rls_open() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT kanon_rls_uid() IS NULL $$;

CREATE OR REPLACE FUNCTION kanon_thesis_readable(tid text) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT EXISTS (SELECT 1 FROM theses t WHERE t.id = tid) $$;

CREATE OR REPLACE FUNCTION kanon_thesis_writable(tid text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM theses t
    WHERE t.id = tid AND (
      t.user_id = kanon_rls_uid()
      OR (t.org_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.org_id = t.org_id AND m.user_id = kanon_rls_uid()
          AND m.accepted_at IS NOT NULL AND m.role IN ('owner', 'pm', 'analyst')
      ))
    )
  )
$$;

CREATE OR REPLACE FUNCTION kanon_thesis_deletable(tid text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM theses t
    WHERE t.id = tid AND (
      t.user_id = kanon_rls_uid()
      OR (t.org_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.org_id = t.org_id AND m.user_id = kanon_rls_uid()
          AND m.accepted_at IS NOT NULL AND m.role = 'owner'
      ))
    )
  )
$$;

ALTER TABLE theses ENABLE ROW LEVEL SECURITY;
ALTER TABLE theses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_theses ON theses;
DROP POLICY IF EXISTS kanon_rls_theses_select ON theses;
DROP POLICY IF EXISTS kanon_rls_theses_write ON theses;
DROP POLICY IF EXISTS kanon_rls_theses_insert ON theses;
DROP POLICY IF EXISTS kanon_rls_theses_update ON theses;
DROP POLICY IF EXISTS kanon_rls_theses_delete ON theses;
CREATE POLICY kanon_rls_theses_select ON theses FOR SELECT USING (
  kanon_rls_is_system() OR kanon_rls_open()
  OR user_id = kanon_rls_uid()
  OR (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.org_id = theses.org_id AND m.user_id = kanon_rls_uid() AND m.accepted_at IS NOT NULL
  ))
);
CREATE POLICY kanon_rls_theses_insert ON theses FOR INSERT WITH CHECK (
  kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid()
);
CREATE POLICY kanon_rls_theses_update ON theses FOR UPDATE
  USING (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(id))
  WITH CHECK (kanon_rls_is_system() OR kanon_rls_open() OR ${THESES_ORG_WRITE_CHECK});
CREATE POLICY kanon_rls_theses_delete ON theses FOR DELETE USING (
  kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_deletable(id)
);

${USER_OWNED_TABLES.map(buildUserOwnedPolicySql).join("\n")}

${THESIS_CHILD_TABLES.map(buildThesisChildPolicySql).join("\n")}

ALTER TABLE research_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_research_notes ON research_notes;
DROP POLICY IF EXISTS kanon_rls_research_notes_select ON research_notes;
DROP POLICY IF EXISTS kanon_rls_research_notes_insert ON research_notes;
DROP POLICY IF EXISTS kanon_rls_research_notes_update ON research_notes;
DROP POLICY IF EXISTS kanon_rls_research_notes_delete ON research_notes;
CREATE POLICY kanon_rls_research_notes_select ON research_notes FOR SELECT
  USING (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_readable(thesis_id));
CREATE POLICY kanon_rls_research_notes_insert ON research_notes FOR INSERT
  WITH CHECK (kanon_rls_is_system() OR kanon_rls_open() OR (kanon_thesis_writable(thesis_id) AND user_id = kanon_rls_uid()));
CREATE POLICY kanon_rls_research_notes_update ON research_notes FOR UPDATE
  USING (kanon_rls_is_system() OR kanon_rls_open() OR (user_id = kanon_rls_uid() AND kanon_thesis_readable(thesis_id)))
  WITH CHECK (kanon_rls_is_system() OR kanon_rls_open() OR (user_id = kanon_rls_uid() AND kanon_thesis_readable(thesis_id)));
CREATE POLICY kanon_rls_research_notes_delete ON research_notes FOR DELETE
  USING (kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid());

ALTER TABLE thesis_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE thesis_comments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_thesis_comments ON thesis_comments;
DROP POLICY IF EXISTS kanon_rls_thesis_comments_select ON thesis_comments;
DROP POLICY IF EXISTS kanon_rls_thesis_comments_insert ON thesis_comments;
DROP POLICY IF EXISTS kanon_rls_thesis_comments_update ON thesis_comments;
DROP POLICY IF EXISTS kanon_rls_thesis_comments_delete ON thesis_comments;
CREATE POLICY kanon_rls_thesis_comments_select ON thesis_comments FOR SELECT
  USING (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_readable(thesis_id));
CREATE POLICY kanon_rls_thesis_comments_insert ON thesis_comments FOR INSERT
  WITH CHECK (kanon_rls_is_system() OR kanon_rls_open() OR (kanon_thesis_readable(thesis_id) AND user_id = kanon_rls_uid()));
CREATE POLICY kanon_rls_thesis_comments_update ON thesis_comments FOR UPDATE
  USING (kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid())
  WITH CHECK (kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid());
CREATE POLICY kanon_rls_thesis_comments_delete ON thesis_comments FOR DELETE
  USING (kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid());
`;
