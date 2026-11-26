export const KANON_INBOX_CATALYSTS_FORECASTS_SQL = `
CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thesis_id TEXT,
  kind TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbox_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thesis_id TEXT,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_url TEXT,
  read_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbox_items_user_created ON inbox_items (user_id, created_at DESC);

ALTER TABLE thesis_catalysts ADD COLUMN IF NOT EXISTS event_date TEXT;
ALTER TABLE thesis_catalysts ADD COLUMN IF NOT EXISTS date_precision TEXT NOT NULL DEFAULT 'quarter';

CREATE TABLE IF NOT EXISTS forecasts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  hypothesis_id TEXT,
  question TEXT NOT NULL,
  forecast_kind TEXT NOT NULL DEFAULT 'binary',
  probabilities_json JSONB NOT NULL,
  resolve_by TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  outcome_json JSONB,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forecasts_user_thesis ON forecasts (user_id, thesis_id, resolve_by);

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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_forecast_immutability ON forecasts;
CREATE TRIGGER trg_guard_forecast_immutability
  BEFORE UPDATE ON forecasts
  FOR EACH ROW
  EXECUTE FUNCTION kanon_guard_forecast_immutability();

CREATE TABLE IF NOT EXISTS calendar_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
