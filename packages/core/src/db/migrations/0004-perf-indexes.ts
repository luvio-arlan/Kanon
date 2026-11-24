export const KANON_PERF_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_hypotheses_thesis_sort
  ON hypotheses (thesis_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_cross_checks_thesis_created
  ON cross_checks (thesis_id, created_at);

CREATE INDEX IF NOT EXISTS idx_cross_checks_linked_thesis
  ON cross_checks (linked_thesis_id)
  WHERE linked_thesis_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discipline_entries_thesis_created
  ON discipline_entries (thesis_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_outputs_thesis_id
  ON copilot_outputs (thesis_id);
`;
