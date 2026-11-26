export const KANON_PORTFOLIO_LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS portfolio_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  cash_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES portfolio_accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  thesis_id TEXT,
  ticker TEXT NOT NULL,
  action TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  fees DOUBLE PRECISION NOT NULL DEFAULT 0,
  trade_date TEXT NOT NULL,
  no_leverage_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions (account_id, trade_date DESC);

CREATE TABLE IF NOT EXISTS lots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES portfolio_accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  open_date TEXT NOT NULL,
  remaining_qty DOUBLE PRECISION NOT NULL,
  cost_basis_per_share DOUBLE PRECISION NOT NULL,
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lots_account_ticker ON lots (account_id, ticker, open_date ASC);
`;
