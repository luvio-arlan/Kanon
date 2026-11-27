/**
 * Expand-only migration 0023 (Wave O + Q foundations):
 * - O2: Invitation-based org membership (`org_invitations`, `memberships.accepted_at`)
 *       and org-scoped portfolio accounts (`portfolio_accounts.org_id`).
 * - O3: Job queue priority + per-user owner tracking (`jobs.priority`, `jobs.owner_user_id`).
 * - O1/Q4: IC approval single-in-review partial unique index & `self_attested` marker.
 * - Q2: Edge-triggered alert rule state (`alert_rules.last_state`), unique rule key,
 *       and `theses.price_as_of` timestamp.
 */
export const KANON_WAVE_O_INVITATIONS_QUEUE_ALERTS_SQL = `
CREATE TABLE IF NOT EXISTS org_invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invitee_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_invitee
  ON org_invitations (invitee_user_id, accepted_at);

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
UPDATE memberships SET accepted_at = created_at WHERE accepted_at IS NULL;

ALTER TABLE portfolio_accounts
  ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_pending_priority
  ON jobs (status, priority, run_at);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_status
  ON jobs (owner_user_id, status)
  WHERE owner_user_id IS NOT NULL;

ALTER TABLE ic_approvals ADD COLUMN IF NOT EXISTS self_attested BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ic_approvals_one_in_review
  ON ic_approvals (thesis_id)
  WHERE state = 'in_review';

ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS last_state TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_rules_user_thesis_kind
  ON alert_rules (user_id, COALESCE(thesis_id, ''), kind);

ALTER TABLE theses ADD COLUMN IF NOT EXISTS price_as_of TIMESTAMPTZ;
`;
