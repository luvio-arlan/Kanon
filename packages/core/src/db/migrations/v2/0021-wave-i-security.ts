export const KANON_WAVE_I_SECURITY_SQL = `
ALTER TABLE portfolio_accounts
  ADD COLUMN IF NOT EXISTS no_leverage_acknowledged_at TIMESTAMPTZ;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS realized_pnl DOUBLE PRECISION;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS external_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_account_external_ref
  ON transactions (account_id, external_ref)
  WHERE external_ref IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE transactions
    ADD CONSTRAINT chk_transactions_positive_qty CHECK (quantity > 0) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE transactions
    ADD CONSTRAINT chk_transactions_nonneg_price_fees CHECK (price >= 0 AND fees >= 0) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE transactions
    ADD CONSTRAINT chk_transactions_valid_action
    CHECK (action IN ('deposit', 'withdraw', 'buy', 'sell', 'dividend')) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE transactions VALIDATE CONSTRAINT chk_transactions_positive_qty;
ALTER TABLE transactions VALIDATE CONSTRAINT chk_transactions_nonneg_price_fees;
ALTER TABLE transactions VALIDATE CONSTRAINT chk_transactions_valid_action;

CREATE OR REPLACE FUNCTION kanon_guard_forecast_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.question IS DISTINCT FROM OLD.question
     OR NEW.forecast_kind IS DISTINCT FROM OLD.forecast_kind
     OR NEW.probabilities_json IS DISTINCT FROM OLD.probabilities_json
     OR NEW.resolve_by IS DISTINCT FROM OLD.resolve_by
     OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
     OR NEW.locked_hash IS DISTINCT FROM OLD.locked_hash THEN
    RAISE EXCEPTION 'Forecast locked columns are immutable to prevent hindsight bias';
  END IF;
  IF OLD.resolved_at IS NOT NULL AND (
     NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
     OR NEW.outcome_json IS DISTINCT FROM OLD.outcome_json
  ) THEN
    RAISE EXCEPTION 'Resolved forecast outcome is immutable and cannot be re-resolved';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION kanon_guard_forecast_no_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('kanon.allow_forecast_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Forecasts cannot be deleted to preserve calibration ledger integrity';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_forecast_no_delete ON forecasts;
CREATE TRIGGER trg_guard_forecast_no_delete
  BEFORE DELETE ON forecasts
  FOR EACH ROW
  EXECUTE FUNCTION kanon_guard_forecast_no_delete();

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entry_hash TEXT NOT NULL DEFAULT '';

DROP TRIGGER IF EXISTS trg_guard_audit_log_no_truncate ON audit_log;
CREATE TRIGGER trg_guard_audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION kanon_guard_audit_log_append_only();

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_items_dedupe
  ON inbox_items (user_id, kind, source_url)
  WHERE source_url IS NOT NULL;

ALTER TABLE calendar_tokens ADD COLUMN IF NOT EXISTS token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_tokens_user_id
  ON calendar_tokens (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_tokens_hash
  ON calendar_tokens (token_hash)
  WHERE token_hash IS NOT NULL;
`;
