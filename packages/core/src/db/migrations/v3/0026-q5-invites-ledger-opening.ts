/**
 * Expand-only migration 0026 (Wave W0 / Q5 remediation):
 * - Q5-2: `org_invitations.revoked_at` / `revoked_by` for inviter revocation & member removal cascades.
 * - Q5-10: `securities.sec_status` (`active` | `not_registrant`) to prevent infinite SEC retries on non-US issuers.
 * - Q5-12: Relax `thesis_catalysts.impact` / `direction` to nullable for unassessed AI catalyst drafts.
 * - Q5-7 / S0: `portfolio_accounts.ledger_inconsistent` + idempotent opening-cash `deposit` backfill (`external_ref = 'opening_balance'`).
 */
export const KANON_Q5_INVITES_LEDGER_OPENING_SQL = `
ALTER TABLE org_invitations
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE org_invitations
  ADD COLUMN IF NOT EXISTS revoked_by TEXT;

ALTER TABLE securities
  ADD COLUMN IF NOT EXISTS sec_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE thesis_catalysts
  ALTER COLUMN impact DROP NOT NULL;
ALTER TABLE thesis_catalysts
  ALTER COLUMN direction DROP NOT NULL;

ALTER TABLE portfolio_accounts
  ADD COLUMN IF NOT EXISTS ledger_inconsistent BOOLEAN NOT NULL DEFAULT FALSE;

WITH tx_sums AS (
  SELECT
    account_id,
    COALESCE(SUM(
      CASE
        WHEN action IN ('deposit', 'dividend', 'sell') THEN (quantity * price - fees)
        ELSE -(quantity * price + fees)
      END
    ), 0) AS net_delta,
    MIN(trade_date) AS min_trade_date,
    MIN(created_at) AS min_created_at
  FROM transactions
  GROUP BY account_id
),
derived AS (
  SELECT
    pa.id AS account_id,
    pa.user_id,
    pa.cash_balance - COALESCE(ts.net_delta, 0) AS opening_cash,
    LEAST(
      to_char(pa.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
      COALESCE(ts.min_trade_date, to_char(pa.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
    ) AS open_date,
    COALESCE(ts.min_created_at - INTERVAL '1 second', pa.created_at) AS open_created_at
  FROM portfolio_accounts pa
  LEFT JOIN tx_sums ts ON ts.account_id = pa.id
  WHERE NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.account_id = pa.id AND t.external_ref = 'opening_balance'
  )
)
INSERT INTO transactions (
  id, account_id, user_id, thesis_id, ticker, action,
  quantity, price, fees, realized_pnl, external_ref,
  trade_date, no_leverage_confirmed, note, created_at
)
SELECT
  'tx_open_' || d.account_id,
  d.account_id,
  d.user_id,
  NULL,
  'CASH',
  'deposit',
  ROUND(d.opening_cash::numeric, 2)::double precision,
  1,
  0,
  NULL,
  'opening_balance',
  d.open_date,
  TRUE,
  '期初现金回填',
  d.open_created_at
FROM derived d
WHERE d.opening_cash > 0.005
ON CONFLICT (account_id, external_ref) WHERE external_ref IS NOT NULL DO NOTHING;

WITH tx_sums AS (
  SELECT
    account_id,
    COALESCE(SUM(
      CASE
        WHEN action IN ('deposit', 'dividend', 'sell') THEN (quantity * price - fees)
        ELSE -(quantity * price + fees)
      END
    ), 0) AS net_delta
  FROM transactions
  GROUP BY account_id
)
UPDATE portfolio_accounts pa
SET ledger_inconsistent = TRUE
FROM tx_sums ts
WHERE ts.account_id = pa.id
  AND (pa.cash_balance - ts.net_delta) < -0.005
  AND NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.account_id = pa.id AND t.external_ref = 'opening_balance'
  );
`;
