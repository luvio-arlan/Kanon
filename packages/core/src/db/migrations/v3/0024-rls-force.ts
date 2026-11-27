/**
 * Expand-only migration 0024 (Wave Q1 & Q4):
 * - Enforces FORCE ROW LEVEL SECURITY on the 5 primary tenant tables so table owners
 *   cannot bypass RLS policies when tenant context is set.
 * - Normalizes any legacy plaintext calendar_tokens rows where token_hash was null.
 */
export const KANON_RLS_FORCE_SQL = `
ALTER TABLE theses FORCE ROW LEVEL SECURITY;
ALTER TABLE portfolio_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE forecasts FORCE ROW LEVEL SECURITY;
ALTER TABLE inbox_items FORCE ROW LEVEL SECURITY;
ALTER TABLE user_ai_credentials FORCE ROW LEVEL SECURITY;

UPDATE calendar_tokens
SET token_hash = encode(sha256(('kanon-ics:' || trim(token))::bytea), 'hex')
WHERE token_hash IS NULL;

UPDATE calendar_tokens
SET token = token_hash
WHERE token_hash IS NOT NULL AND token <> token_hash;
`;
