export const KANON_WAREHOUSE_CORE_SQL = `
CREATE TABLE IF NOT EXISTS securities (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  exchange_mic TEXT NOT NULL DEFAULT 'XNAS',
  cik TEXT,
  name TEXT NOT NULL,
  share_class TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  country TEXT NOT NULL DEFAULT 'US',
  adr_ratio DOUBLE PRECISION NOT NULL DEFAULT 1,
  adr_ratio_source TEXT NOT NULL DEFAULT 'default',
  sector_code TEXT,
  industry_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  listed_at TEXT,
  delisted_at TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_securities_ticker_exchange
  ON securities (ticker, exchange_mic);

ALTER TABLE theses ADD COLUMN IF NOT EXISTS security_id TEXT;

CREATE TABLE IF NOT EXISTS fx_rates_daily (
  currency TEXT NOT NULL,
  rate_date TEXT NOT NULL,
  usd_per_unit DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL DEFAULT 'ecb',
  PRIMARY KEY (currency, rate_date)
);

CREATE TABLE IF NOT EXISTS price_bars_daily (
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  bar_date TEXT NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  adj_close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION,
  source TEXT NOT NULL,
  PRIMARY KEY (security_id, bar_date)
);

CREATE TABLE IF NOT EXISTS corporate_actions (
  id TEXT PRIMARY KEY,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  ex_date TEXT NOT NULL,
  kind TEXT NOT NULL,
  ratio DOUBLE PRECISION,
  amount DOUBLE PRECISION,
  currency TEXT NOT NULL DEFAULT 'USD'
);
`;
