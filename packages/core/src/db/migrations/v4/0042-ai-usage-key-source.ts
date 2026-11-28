/**
 * Migration 0042 · Wave V2-2 hosted-AI quota: tag every `ai_usage` row with who paid for the tokens
 * (`byok` = the user's own key, `hosted` = KANON's server key). Legacy rows stay NULL. Expand-only.
 */
export const KANON_WAVE_V2_AI_USAGE_KEY_SOURCE_SQL = `
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS key_source TEXT;
DO $$ BEGIN
  ALTER TABLE ai_usage ADD CONSTRAINT chk_ai_usage_key_source
    CHECK (key_source IS NULL OR key_source IN ('byok', 'hosted')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;
