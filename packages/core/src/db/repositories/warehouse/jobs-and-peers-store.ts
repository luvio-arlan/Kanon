import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { type JobStatus, jobsTable, thesesTable } from "../../schema";

export interface QueuedJobRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  status: JobStatus;
  lastError: string | null;
}

export interface JobQueueHealth {
  pending: number;
  running: number;
  failed: number;
  done: number;
}

export async function enqueueJob(
  db: KanonDb,
  input: {
    id?: string;
    kind: string;
    payload?: Record<string, unknown>;
    runAt?: Date;
    maxAttempts?: number;
  },
): Promise<string> {
  const id = input.id ?? `job_${crypto.randomUUID()}`;
  await db
    .insert(jobsTable)
    .values({
      id,
      kind: input.kind,
      payload: input.payload ?? {},
      runAt: input.runAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 5,
      status: "pending",
    })
    .onConflictDoNothing();
  return id;
}

/**
 * Fans out daily idempotent watchlist jobs (daily bars, SEC sync, alert evaluation)
 * for all distinct tickers across active theses.
 */
export async function enqueueWatchlistJobs(db: KanonDb, dateKey?: string): Promise<number> {
  const day = dateKey ?? new Date().toISOString().slice(0, 10);
  const rows = await db.selectDistinct({ ticker: thesesTable.ticker }).from(thesesTable);
  let enqueued = 0;
  for (const row of rows) {
    const ticker = row.ticker.trim().toUpperCase();
    if (!ticker) continue;
    await enqueueJob(db, {
      id: `sync_daily_bars:${ticker}:${day}`,
      kind: "sync_daily_bars",
      payload: { ticker },
      maxAttempts: 4,
    });
    await enqueueJob(db, {
      id: `sync_sec:${ticker}:${day}`,
      kind: "sync_sec",
      payload: { ticker },
      maxAttempts: 4,
    });
    enqueued += 2;
  }
  await enqueueJob(db, {
    id: `evaluate_alerts:${day}`,
    kind: "evaluate_alerts",
    payload: { day },
    maxAttempts: 3,
  });
  return enqueued + 1;
}

/**
 * Terminates poisoned jobs whose lease expired after exhausting max_attempts,
 * then atomically claims due jobs using `FOR UPDATE SKIP LOCKED`.
 */
export async function claimDueJobs(
  db: KanonDb,
  params: { workerId: string; limit?: number; leaseSeconds?: number },
): Promise<QueuedJobRow[]> {
  const limit = Math.max(1, Math.min(25, params.limit ?? 5));
  const leaseSec = Math.max(15, Math.min(600, params.leaseSeconds ?? 120));
  await db.execute(sql`
    UPDATE jobs
    SET status = 'failed',
        locked_by = NULL,
        locked_until = NULL,
        last_error = COALESCE(last_error, 'Exceeded max attempts after worker lease timeout')
    WHERE status = 'running'
      AND locked_until IS NOT NULL
      AND locked_until < NOW()
      AND attempts >= max_attempts
  `);
  const res = await db.execute(sql`
    WITH due AS (
      SELECT id FROM jobs
      WHERE attempts < max_attempts
        AND (
          (status = 'pending' AND run_at <= NOW())
          OR (status = 'running' AND locked_until IS NOT NULL AND locked_until < NOW())
        )
      ORDER BY run_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE jobs
    SET status = 'running',
        locked_by = ${params.workerId},
        locked_until = NOW() + (${leaseSec} * INTERVAL '1 second'),
        attempts = attempts + 1
    FROM due
    WHERE jobs.id = due.id
    RETURNING jobs.id, jobs.kind, jobs.payload, jobs.attempts, jobs.max_attempts, jobs.status, jobs.last_error
  `);
  const rawRows = (Array.isArray(res) ? res : res.rows) as Record<string, unknown>[];
  return rawRows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    payload: (r.payload as Record<string, unknown>) ?? {},
    attempts: Number(r.attempts ?? 0),
    maxAttempts: Number(r.max_attempts ?? 5),
    status: String(r.status) as JobStatus,
    lastError: r.last_error ? String(r.last_error) : null,
  }));
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

export async function getJobQueueHealth(db: KanonDb): Promise<JobQueueHealth> {
  const rows = await db
    .select({ status: jobsTable.status, cnt: sql<number>`count(*)::int` })
    .from(jobsTable)
    .groupBy(jobsTable.status);
  const out: JobQueueHealth = { pending: 0, running: 0, failed: 0, done: 0 };
  for (const r of rows) {
    if (r.status in out) out[r.status] = Number(r.cnt ?? 0);
  }
  return out;
}
