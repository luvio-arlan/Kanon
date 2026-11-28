/**
 * Migration 0039 · Wave V0-4 re-flag accounts whose canonical numeric-exchange tickers (`0700-HK`,
 * `600519-SS`, `7203-T`) were stamped USD × 1. `normalizeCanonicalTicker` rewrites `.` to `-`, so the
 * `0034` suffix regex and `0035` back-fill never saw them. Flagged accounts are gated as
 * `currency_unconfirmed` until the owner re-confirms (data is never rewritten silently). Expand-only.
 */
export const KANON_WAVE_V0_NUMERIC_EXCHANGE_REFLAG_SQL = `
UPDATE portfolio_accounts SET ledger_inconsistent = TRUE
WHERE ledger_inconsistent = FALSE
  AND id IN (
    SELECT account_id FROM transactions
    WHERE ticker ~* '^[0-9]{1,6}[-.](HK|SS|SZ|T)$'
      AND COALESCE(trade_currency, 'USD') = 'USD'
  );
`;
