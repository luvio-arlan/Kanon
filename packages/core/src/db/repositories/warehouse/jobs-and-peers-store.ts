import crypto from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { type JobStatus, jobsTable, securitiesTable, thesesTable } from "../../schema";
import { SYSTEM_META_JOB_KINDS } from "./job-queue-helpers";

export {
  ALERT_CURSOR_JOB_ID,
  getAlertEvalCursor,
  getDbSizePct,
  getJobQueueHealth,
  type JobQueueHealth,
  recordTickHeartbeat,
  requeueJobForCursor,
  setAlertEvalCursor,
  skipJob,
} from "./job-queue-helpers";

export interface QueuedJobRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  priority: number;
  attempts: number;
  maxAttempts: number;
  status: JobStatus;
  lastError: string | null;
}

export async function enqueueJob(
  db: KanonDb,
  input: {
    id?: string;
    kind: string;
    payload?: Record<string, unknown>;
    priority?: number;
    ownerUserId?: string | null;
    runAt?: Date;
    maxAttempts?: number;
  },
): Promise<{ id: string; inserted: boolean }> {
  const id = input.id ?? `job_${crypto.randomUUID()}`;
  const inserted = await db
    .insert(jobsTable)
    .values({
      id,
      kind: input.kind,
      payload: input.payload ?? {},
      priority: input.priority ?? 100,
      ownerUserId: input.ownerUserId ?? null,
      runAt: input.runAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 5,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning();
  return { id, inserted: inserted.length > 0 };
}

export async function countUserPendingJobs(db: KanonDb, userId: string): Promise<number> {
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(jobsTable)
    .where(and(eq(jobsTable.ownerUserId, userId), eq(jobsTable.status, "pending")));
  return Number(row?.cnt ?? 0);
}

async function enqueueTickerDailyPair(
  db: KanonDb,
  params: { ticker: string; day: string; isSunday: boolean; isSecRegistrant: boolean },
): Promise<number> {
  await enqueueJob(db, {
    id: `sync_daily_bars:${params.ticker}:${params.day}`,
    kind: "sync_daily_bars",
    payload: params.isSunday
      ? { ticker: params.ticker, forceFullRebase: true }
      : { ticker: params.ticker },
    priority: 50,
    maxAttempts: 4,
  });
  if (!params.isSecRegistrant) return 1;
  await enqueueJob(db, {
    id: `sync_sec:${params.ticker}:${params.day}`,
    kind: "sync_sec",
    payload: { ticker: params.ticker },
    priority: 60,
    maxAttempts: 4,
  });
  return 2;
}

async function enqueueGlobalDailyJobs(db: KanonDb, day: string, isSunday: boolean) {
  await enqueueJob(db, {
    id: `sync_daily_bars:SPY:${day}`,
    kind: "sync_daily_bars",
    payload: isSunday ? { ticker: "SPY", forceFullRebase: true } : { ticker: "SPY" },
    priority: 45,
    maxAttempts: 4,
  });
  const daily = [["evaluate_alerts", 90, 3]] as const;
  for (const [kind, priority, maxAttempts] of daily) {
    await enqueueJob(db, { id: `${kind}:${day}`, kind, payload: { day }, priority, maxAttempts });
  }
  return 2;
}

/**
 * Fans out daily idempotent watchlist jobs (daily bars, SEC sync, guidance resolution, chunk prune, alerts)
 * for all distinct tickers across non-archived theses.
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

/**
 * Terminates poisoned jobs whose lease expired after exhausting max_attempts,
 * then atomically claims due jobs using `FOR UPDATE SKIP LOCKED`.
 */
function mapRawJobRow(r: Record<string, unknown>): QueuedJobRow {
  return {
    id: String(r.id),
    kind: String(r.kind),
    payload: (r.payload as Record<string, unknown>) ?? {},
    priority: Number(r.priority ?? 100),
    attempts: Number(r.attempts ?? 0),
    maxAttempts: Number(r.max_attempts ?? 5),
    status: String(r.status) as JobStatus,
    lastError: r.last_error ? String(r.last_error) : null,
  };
}

export async function claimDueJobs(
  db: KanonDb,
  params: {
    workerId: string;
    limit?: number;
    leaseSeconds?: number;
    excludeKinds?: readonly string[];
  },
): Promise<QueuedJobRow[]> {
  const limit = Math.max(1, Math.min(25, params.limit ?? 1));
  const leaseSec = Math.max(15, Math.min(600, params.leaseSeconds ?? 120));
  const excluded = [...SYSTEM_META_JOB_KINDS, ...(params.excludeKinds ?? [])];
  const excludedSql = sql.join(
    excluded.map((k) => sql`${k}`),
    sql`, `,
  );
  await db.execute(sql`
    UPDATE jobs SET status = 'failed', locked_by = NULL, locked_until = NULL,
      last_error = COALESCE(last_error, 'Exceeded max attempts after worker lease timeout')
    WHERE status = 'running' AND locked_until IS NOT NULL AND locked_until < NOW() AND attempts >= max_attempts
  `);
  const res = await db.execute(sql`
    WITH due AS (
      SELECT id FROM jobs
      WHERE kind NOT IN (${excludedSql}) AND attempts < max_attempts
        AND ((status = 'pending' AND run_at <= NOW())
          OR (status = 'running' AND locked_until IS NOT NULL AND locked_until < NOW()))
      ORDER BY priority ASC, run_at ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
    )
    UPDATE jobs SET status = 'running', locked_by = ${params.workerId},
      locked_until = NOW() + (${leaseSec} * INTERVAL '1 second'), attempts = attempts + 1
    FROM due WHERE jobs.id = due.id
    RETURNING jobs.id, jobs.kind, jobs.payload, jobs.priority, jobs.attempts, jobs.max_attempts, jobs.status, jobs.last_error
  `);
  const rawRows = (Array.isArray(res) ? res : res.rows) as Record<string, unknown>[];
  return rawRows.map(mapRawJobRow);
}

export async function completeJob(db: KanonDb, jobId: string, workerId?: string): Promise<boolean> {
  const cond = workerId
    ? and(eq(jobsTable.id, jobId), eq(jobsTable.lockedBy, workerId))
    : eq(jobsTable.id, jobId);
  const updated = await db
    .update(jobsTable)
    .set({ status: "done", lockedBy: null, lockedUntil: null, lastError: null })
    .where(cond)
    .returning();
  return updated.length > 0;
}

export async function failJobWithBackoff(
  db: KanonDb,
  jobId: string,
  errorMessage: string,
  workerId?: string,
): Promise<JobStatus> {
  const cond = workerId
    ? and(eq(jobsTable.id, jobId), eq(jobsTable.lockedBy, workerId))
    : eq(jobsTable.id, jobId);
  const [row] = await db.select().from(jobsTable).where(cond).limit(1);
  if (!row) return "failed";
  const exhausted = row.attempts >= row.maxAttempts;
  const backoffSec = Math.min(3600, 30 * 2 ** Math.max(0, row.attempts - 1));
  const nextStatus: JobStatus = exhausted ? "failed" : "pending";
  await db
    .update(jobsTable)
    .set({
      status: nextStatus,
      lockedBy: null,
      lockedUntil: null,
      lastError: errorMessage.slice(0, 500),
      runAt: exhausted ? row.runAt : new Date(Date.now() + backoffSec * 1000),
    })
    .where(cond);
  return nextStatus;
}
