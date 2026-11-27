/**
 * Expand-only migration 0032 (Wave W4 — R4 Full-Text Search Index):
 * Expression GIN index on `to_tsvector('english', text)` without adding a stored column.
 */
export const KANON_FILING_CHUNKS_FTS_SQL = `
CREATE INDEX IF NOT EXISTS idx_filing_chunks_fts
  ON filing_chunks USING GIN (to_tsvector('english', text));
`;
