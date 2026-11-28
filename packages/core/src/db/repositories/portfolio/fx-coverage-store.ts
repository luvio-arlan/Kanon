import { sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";

/** ECB euro reference rates begin on 1999-01-04; nothing earlier can ever be backfilled. */
export const ECB_FIRST_RATE_DATE = "1999-01-04";
const BACKFILL_PAD_DAYS = 10;
const MAX_PUBLICATION_GAP_DAYS = 4;

function shiftIsoDays(iso: string, delta: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}

function rowsOf(res: unknown): Array<Record<string, unknown>> {
  return (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Array<
    Record<string, unknown>
  >;
}

/**
 * Returns the ECB `startPeriod` needed so every non-USD currency has rates covering `[fromDate, today]`,
 * or `null` when coverage is complete (V0-2). Never interpolates: it only says what to fetch.
 */
export async function findFxBackfillStart(
  db: KanonDb,
  params: { currencies: readonly string[]; fromDate: string; today: string },
): Promise<string | null> {
  const codes = [
    ...new Set(
      params.currencies.map((c) => c.trim().toUpperCase()).filter((c) => c && c !== "USD"),
    ),
  ];
  if (codes.length === 0) return null;
  const res = await db.execute(sql`
    SELECT currency, MIN(rate_date) AS earliest, MAX(rate_date) AS latest
    FROM fx_rates_daily
    WHERE currency IN (${sql.join(
      codes.map((c) => sql`${c}`),
      sql`, `,
    )})
    GROUP BY currency
  `);
  const byCode = new Map(rowsOf(res).map((r) => [String(r.currency), r]));
  const wantFrom = params.fromDate < ECB_FIRST_RATE_DATE ? ECB_FIRST_RATE_DATE : params.fromDate;
  const staleBefore = shiftIsoDays(params.today, -MAX_PUBLICATION_GAP_DAYS);
  const needs = codes
    .map((code) => currencyBackfillStart(byCode.get(code), wantFrom, staleBefore))
    .filter((d): d is string => d !== null)
    .sort();
  const start = needs[0];
  if (!start) return null;
  return start < ECB_FIRST_RATE_DATE ? ECB_FIRST_RATE_DATE : start;
}

function currencyBackfillStart(
  row: Record<string, unknown> | undefined,
  wantFrom: string,
  staleBefore: string,
): string | null {
  const earliest = row ? String(row.earliest) : null;
  const latest = row ? String(row.latest) : null;
  if (!earliest || earliest > wantFrom) return shiftIsoDays(wantFrom, -BACKFILL_PAD_DAYS);
  if (!latest || latest < staleBefore) return latest ?? wantFrom;
  return null;
}

/** System-wide earliest trade date that needs non-USD FX (any non-USD base account or trade currency). */
export async function findEarliestForeignLedgerDate(db: KanonDb): Promise<string | null> {
  const res = await db.execute(sql`
    SELECT MIN(t.trade_date) AS d
    FROM transactions t
    JOIN portfolio_accounts a ON a.id = t.account_id
    WHERE a.base_currency <> 'USD' OR COALESCE(t.trade_currency, 'USD') <> 'USD'
  `);
  const d = rowsOf(res)[0]?.d;
  return typeof d === "string" && d.length === 10 ? d : null;
}

/** Earliest trade date of one tenant-owned account, for pre-confirmation FX backfill (V0-4). */
export async function findEarliestAccountTradeDate(
  db: KanonDb,
  params: { accountId: string; userId: string },
): Promise<string | null> {
  const res = await db.execute(sql`
    SELECT MIN(trade_date) AS d FROM transactions
    WHERE account_id = ${params.accountId} AND user_id = ${params.userId}
  `);
  const d = rowsOf(res)[0]?.d;
  return typeof d === "string" && d.length === 10 ? d : null;
}
