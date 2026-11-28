/**
 * Migration 0035 · Wave U1-1 Multi-Currency Accounts, FX Rates Provenance & Transaction Reversals.
 * Strictly expand-only: adds currency/FX/reversal columns, NOT VALID check constraints, and partial unique index.
 */
export const KANON_WAVE_U1_MULTI_CURRENCY_SQL = `
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS trade_currency TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fx_to_base DOUBLE PRECISION;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fx_source TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reverses_tx_id TEXT;

UPDATE transactions t
SET trade_currency = 'USD', fx_to_base = 1, fx_source = 'identity'
FROM portfolio_accounts a
WHERE a.id = t.account_id
  AND t.trade_currency IS NULL
  AND a.ledger_inconsistent = FALSE;

DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT chk_tx_fx CHECK (
    trade_currency IS NOT NULL
    AND fx_to_base > 0
    AND fx_to_base < 1e6
    AND fx_source IN ('identity', 'ecb_reference', 'broker')
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reverses
  ON transactions (reverses_tx_id) WHERE reverses_tx_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE portfolio_accounts ADD CONSTRAINT chk_account_base_currency
    CHECK (base_currency IN ('USD', 'HKD', 'CNY', 'EUR', 'GBP', 'JPY')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE securities ADD COLUMN IF NOT EXISTS trading_currency TEXT;
ALTER TABLE fx_rates_daily ADD COLUMN IF NOT EXISTS source_license TEXT NOT NULL DEFAULT 'ecb_reference';
`;
