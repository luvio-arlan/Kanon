export const KANON_SEC_FILING_DOCS_CACHE_SQL = `
CREATE TABLE IF NOT EXISTS sec_filing_documents_cache (
  accession_number TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  form TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  document_url TEXT NOT NULL,
  sections_json JSONB NOT NULL,
  diff_json JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec_filing_docs_ticker_date ON sec_filing_documents_cache (ticker, filing_date DESC);
`;
