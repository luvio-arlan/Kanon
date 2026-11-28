import { sql } from "drizzle-orm";
import type { HealthFreshness } from "../../../contracts/ops";
import type { KanonDb } from "../../bootstrap";

const STALE_BAR_CALENDAR_DAYS = 7;
const NEW_THESIS_GRACE_DAYS = 3;

function firstRow(res: unknown): Record<string, unknown> | undefined {
  return (
    (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Array<Record<string, unknown>>
  )[0];
}

/**
 * Falsifiable data freshness (V1-5 / G38): counts researched tickers whose latest daily bar is older than
 * 7 calendar days, and cron jobs superseded in the last 48h. `supersede` keeps `backlog` at zero, so
 * starvation is only visible here — never through queue length.
 */
export async function getQueueFreshness(db: KanonDb): Promise<HealthFreshness> {
  const [stale, superseded] = await Promise.all([
    db.execute(sql`
      WITH watch AS (
        SELECT DISTINCT replace(upper(t.ticker), '.', '-') AS ticker
        FROM theses t
        WHERE t.status <> 'archived_veto'
          AND t.created_at < NOW() - make_interval(days => ${NEW_THESIS_GRACE_DAYS})
      )
      SELECT COUNT(*)::int AS n
      FROM watch w
      LEFT JOIN securities s ON replace(upper(s.ticker), '.', '-') = w.ticker
      LEFT JOIN LATERAL (
        SELECT MAX(b.bar_date) AS last_bar FROM price_bars_daily b WHERE b.security_id = s.id
      ) lb ON TRUE
      WHERE lb.last_bar IS NULL
         OR lb.last_bar < to_char(NOW() - make_interval(days => ${STALE_BAR_CALENDAR_DAYS}), 'YYYY-MM-DD')
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS n FROM jobs
      WHERE status = 'skipped' AND last_error = 'superseded'
        AND created_at >= NOW() - INTERVAL '48 hours'
    `),
  ]);
  return {
    staleTickers: Number(firstRow(stale)?.n ?? 0),
    superseded48h: Number(firstRow(superseded)?.n ?? 0),
  };
}
