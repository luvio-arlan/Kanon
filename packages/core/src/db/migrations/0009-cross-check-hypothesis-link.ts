export const KANON_CROSS_CHECK_HYPOTHESIS_LINK_SQL = `
ALTER TABLE cross_checks ADD COLUMN IF NOT EXISTS hypothesis_id TEXT;
CREATE INDEX IF NOT EXISTS idx_cross_checks_hypothesis_id ON cross_checks (hypothesis_id);
`;
