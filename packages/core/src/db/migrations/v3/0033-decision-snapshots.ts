/**
 * Expand-only migration 0033 (Wave S · S3):
 * - Immutable `decision_snapshots` locked on buy transactions linked to a thesis
 * - Append-only `hypothesis_status_events` log for PIT hypothesis verdict history
 * - BEFORE UPDATE OR DELETE immutability triggers + FORCE ROW LEVEL SECURITY
 * - Idempotent backfill of existing `hypotheses` rows with `source = 'import'`
 */
export const KANON_DECISION_SNAPSHOTS_SQL = `
CREATE TABLE IF NOT EXISTS decision_snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  thesis_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_user_ticker
  ON decision_snapshots(user_id, ticker, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_decision_snapshots_thesis
  ON decision_snapshots(thesis_id);

CREATE TABLE IF NOT EXISTS hypothesis_status_events (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL,
  hypothesis_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('validated', 'watching', 'warning', 'invalidated')),
  source TEXT NOT NULL CHECK (source IN ('step_edit', 'quarterly_review', 'agent_apply', 'import')),
  actor_user_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hyp_events_thesis_time
  ON hypothesis_status_events(thesis_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_hyp_events_hyp_time
  ON hypothesis_status_events(hypothesis_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION kanon_prevent_immutable_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table % is immutable / append-only', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_decision_snapshots_immutable ON decision_snapshots;
CREATE TRIGGER trg_decision_snapshots_immutable
  BEFORE UPDATE OR DELETE ON decision_snapshots
  FOR EACH ROW EXECUTE FUNCTION kanon_prevent_immutable_mutation();

DROP TRIGGER IF EXISTS trg_hyp_events_append_only ON hypothesis_status_events;
CREATE TRIGGER trg_hyp_events_append_only
  BEFORE UPDATE OR DELETE ON hypothesis_status_events
  FOR EACH ROW EXECUTE FUNCTION kanon_prevent_immutable_mutation();

ALTER TABLE decision_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_decision_snapshots_select ON decision_snapshots;
CREATE POLICY kanon_decision_snapshots_select ON decision_snapshots
  FOR SELECT USING (kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid());
DROP POLICY IF EXISTS kanon_decision_snapshots_insert ON decision_snapshots;
CREATE POLICY kanon_decision_snapshots_insert ON decision_snapshots
  FOR INSERT WITH CHECK (kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid());

ALTER TABLE hypothesis_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_status_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_hyp_events_select ON hypothesis_status_events;
CREATE POLICY kanon_hyp_events_select ON hypothesis_status_events
  FOR SELECT USING (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_readable(thesis_id));
DROP POLICY IF EXISTS kanon_hyp_events_insert ON hypothesis_status_events;
CREATE POLICY kanon_hyp_events_insert ON hypothesis_status_events
  FOR INSERT WITH CHECK (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(thesis_id));

INSERT INTO hypothesis_status_events (id, thesis_id, hypothesis_id, from_status, to_status, source, actor_user_id, note, recorded_at)
SELECT
  'hse_init_' || h.id,
  h.thesis_id,
  h.id,
  NULL,
  CASE WHEN h.status IN ('validated', 'watching', 'warning', 'invalidated') THEN h.status ELSE 'watching' END,
  'import',
  t.user_id,
  'Migration 0033 initial hypothesis status backfill',
  COALESCE(t.created_at, NOW())
FROM hypotheses h
JOIN theses t ON t.id = h.thesis_id
ON CONFLICT (id) DO NOTHING;
`;
