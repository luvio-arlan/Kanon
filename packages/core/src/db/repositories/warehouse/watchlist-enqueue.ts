import { eq, ne, sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { securitiesTable, thesesTable } from "../../schema";
import { enqueueJob } from "./jobs-and-peers-store";

async function supersedeOlderPendingTickerJob(
  db: KanonDb,
  kind: string,
  ticker: string,
  keepJobId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE jobs
    SET status = 'skipped',
        locked_by = NULL,
        locked_until = NULL,
        last_error = 'superseded'
    WHERE kind = ${kind}
      AND status = 'pending'
      AND id <> ${keepJobId}
      AND payload->>'ticker' = ${ticker}
  `);
}

async function supersedeOlderPendingGlobalJob(
  db: KanonDb,
  kind: string,
  keepJobId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE jobs
    SET status = 'skipped',
        locked_by = NULL,
        locked_until = NULL,
        last_error = 'superseded'
    WHERE kind = ${kind}
      AND status = 'pending'
      AND id <> ${keepJobId}
  `);
}

async function enqueueTickerDailyPair(
  db: KanonDb,
  params: { ticker: string; day: string; isSunday: boolean; isSecRegistrant: boolean },
): Promise<number> {
  const barsId = `sync_daily_bars:${params.ticker}:${params.day}`;
  await supersedeOlderPendingTickerJob(db, "sync_daily_bars", params.ticker, barsId);
  await enqueueJob(db, {
    id: barsId,
    kind: "sync_daily_bars",
    payload: params.isSunday
      ? { ticker: params.ticker, forceFullRebase: true }
      : { ticker: params.ticker },
    priority: 50,
    maxAttempts: 4,
  });
  if (!params.isSecRegistrant) return 1;
  const secId = `sync_sec:${params.ticker}:${params.day}`;
  await supersedeOlderPendingTickerJob(db, "sync_sec", params.ticker, secId);
  await enqueueJob(db, {
    id: secId,
    kind: "sync_sec",
    payload: { ticker: params.ticker },
    // Ahead of press-release extraction (55): new periodic filings beat derived guidance (V1-5).
    priority: 52,
    maxAttempts: 4,
  });
  return 2;
}

async function enqueueGlobalDailyJobs(db: KanonDb, day: string, isSunday: boolean) {
  const spyId = `sync_daily_bars:SPY:${day}`;
  await supersedeOlderPendingTickerJob(db, "sync_daily_bars", "SPY", spyId);
  await enqueueJob(db, {
    id: spyId,
    kind: "sync_daily_bars",
    payload: isSunday ? { ticker: "SPY", forceFullRebase: true } : { ticker: "SPY" },
    priority: 45,
    maxAttempts: 4,
  });
  const daily = [
    ["sync_fx_rates", 40, 3],
    ["resolve_guidance", 80, 3],
    ["prune_chunks", 95, 2],
    ["evaluate_alerts", 90, 3],
  ] as const;
  for (const [kind, priority, maxAttempts] of daily) {
    const id = `${kind}:${day}`;
    await supersedeOlderPendingGlobalJob(db, kind, id);
    await enqueueJob(db, { id, kind, payload: { day }, priority, maxAttempts });
  }
  return 5;
}

/**
 * Fans out daily idempotent watchlist jobs while superseding stale pending backlog
 * so each `(kind, ticker)` retains at most one pending job (U0-2).
 */
export async function enqueueWatchlistJobs(db: KanonDb, dateKey?: string): Promise<number> {
  const day = dateKey ?? new Date().toISOString().slice(0, 10);
  const isSunday = new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
  const [rows, nonSecRows] = await Promise.all([
    db
      .selectDistinct({ ticker: thesesTable.ticker })
      .from(thesesTable)
      .where(ne(thesesTable.status, "archived_veto")),
    db
      .select({ ticker: securitiesTable.ticker })
      .from(securitiesTable)
      .where(eq(securitiesTable.secStatus, "not_registrant")),
  ]);
  const nonSecSet = new Set(nonSecRows.map((r) => r.ticker.trim().toUpperCase()));
  let enqueued = 0;
  for (const row of rows) {
    const ticker = row.ticker.trim().toUpperCase();
    if (!ticker) continue;
    enqueued += await enqueueTickerDailyPair(db, {
      ticker,
      day,
      isSunday,
      isSecRegistrant: !nonSecSet.has(ticker),
    });
  }
  return enqueued + (await enqueueGlobalDailyJobs(db, day, isSunday));
}
