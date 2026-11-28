/**
 * Migration 0040 · Wave V1-1 press-guidance candidate versioning & retraction (expand-only).
 * `rule/1` merged "GAAP and non-GAAP … A and B, respectively" into one non-GAAP range; those rows are
 * retracted (hidden, not deleted) and superseded in place when `rule_version` 2 re-extracts the filing.
 */
export const KANON_WAVE_V1_GUIDANCE_CANDIDATE_RETRACTION_SQL = `
ALTER TABLE guidance_candidates ADD COLUMN IF NOT EXISTS rule_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE guidance_candidates ADD COLUMN IF NOT EXISTS retracted_at TIMESTAMPTZ;
ALTER TABLE guidance_candidates ADD COLUMN IF NOT EXISTS retract_reason TEXT;

DO $$ BEGIN
  ALTER TABLE guidance_candidates ADD CONSTRAINT chk_guidance_candidates_rule_version
    CHECK (rule_version >= 1) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE guidance_candidates
SET retracted_at = NOW(), retract_reason = 'basis_merged'
WHERE retracted_at IS NULL AND rule_version = 1 AND quote ~* 'gaap\\s+and\\s+non-gaap';
`;
