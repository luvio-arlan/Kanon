import crypto from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { type JobStatus, jobsTable, thesesTable } from "../../schema";

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

export interface JobQueueHealth {
  pending: number;
  running: number;
  failed: number;
  done: number;
  oldestPendingAgeSec: number | null;
  lastTickAt: string | null;
  lastTickCompleted: number | null;
}

const TICK_HEARTBEAT_JOB_ID = "sys:last_tick";

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
): Promise<string> {
  const id = input.id ?? `job_${crypto.randomUUID()}`;
  await db
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
    .onConflictDoNothing();
  return id;
}

export async function countUserPendingJobs(db: KanonDb, userId: string): Promise<number> {
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(jobsTable)
    .where(and(eq(jobsTable.ownerUserId, userId), eq(jobsTable.status, "pending")));
  return Number(row?.cnt ?? 0);
}

/**
 * Fans out daily idempotent watchlist jobs (daily bars, SEC sync, alert evaluation)
 * for all distinct tickers across non-archived theses.
 */
export async function enqueueWatchlistJobs(db: KanonDb, dateKey?: string): Promise<number> {
  const day = dateKey ?? new Date().toISOString().slice(0, 10);
  const rows = await db
    .selectDistinct({ ticker: thesesTable.ticker })
    .from(thesesTable)
    .where(ne(thesesTable.status, "archived_veto"));
  let enqueued = 0;
  for (const row of rows) {
    const ticker = row.ticker.trim().toUpperCase();
    if (!ticker) continue;
    await enqueueJob(db, {
      id: `sync_daily_bars:${ticker}:${day}`,
      kind: "sync_daily_bars",
      payload: { ticker },
      priority: 50,
      maxAttempts: 4,
    });
    await enqueueJob(db, {
      id: `sync_sec:${ticker}:${day}`,
      kind: "sync_sec",
      payload: { ticker },
      priority: 60,
      maxAttempts: 4,
    });
    enqueued += 2;
  }
  await enqueueJob(db, {
    id: `evaluate_alerts:${day}`,
    kind: "evaluate_alerts",
    payload: { day },
    priority: 10,
    maxAttempts: 3,
  });
  return enqueued + 1;
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
  params: { workerId: string; limit?: number; leaseSeconds?: number },
): Promise<QueuedJobRow[]> {
  const limit = Math.max(1, Math.min(25, params.limit ?? 1));
  const leaseSec = Math.max(15, Math.min(600, params.leaseSeconds ?? 120));
  await db.execute(sql`
    UPDATE jobs SET status = 'failed', locked_by = NULL, locked_until = NULL,
      last_error = COALESCE(last_error, 'Exceeded max attempts after worker lease timeout')
    WHERE status = 'running' AND locked_until IS NOT NULL AND locked_until < NOW() AND attempts >= max_attempts
  `);
  const res = await db.execute(sql`
    WITH due AS (
      SELECT id FROM jobs
      WHERE kind <> 'tick_heartbeat' AND attempts < max_attempts
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

export async function recordTickHeartbeat(
  db: KanonDb,
  stats: { claimed: number; completed: number; failed: number },
): Promise<void> {
  const now = new Date();
  const payload = { at: now.toISOString(), ...stats };
  await db
    .insert(jobsTable)
    .values({
      id: TICK_HEARTBEAT_JOB_ID,
      kind: "tick_heartbeat",
      payload,
      priority: 999,
      runAt: now,
      status: "done",
    })
    .onConflictDoUpdate({
      target: jobsTable.id,
      set: { payload, runAt: now, status: "done" },
    });
}

function parseOldestAgeSec(oldest: string | null | undefined): number | null {
  if (!oldest) return null;
  const ms = Date.parse(oldest);
  return Number.isFinite(ms) ? Math.max(0, Math.floor((Date.now() - ms) / 1000)) : null;
}

export async function getJobQueueHealth(db: KanonDb): Promise<JobQueueHealth> {
  const [counts, [oldest], [heartbeat]] = await Promise.all([
    db
      .select({ status: jobsTable.status, cnt: sql<number>`count(*)::int` })
      .from(jobsTable)
      .where(ne(jobsTable.kind, "tick_heartbeat"))
      .groupBy(jobsTable.status),
    db
      .select({ oldest: sql<string | null>`MIN(created_at)::text` })
      .from(jobsTable)
      .where(and(eq(jobsTable.status, "pending"), ne(jobsTable.kind, "tick_heartbeat"))),
    db
      .select({ payload: jobsTable.payload })
      .from(jobsTable)
      .where(eq(jobsTable.id, TICK_HEARTBEAT_JOB_ID))
      .limit(1),
  ]);
  const map = new Map(counts.map((r) => [r.status, Number(r.cnt ?? 0)]));
  const hb = heartbeat?.payload;
  return {
    pending: map.get("pending") ?? 0,
    running: map.get("running") ?? 0,
    failed: map.get("failed") ?? 0,
    done: map.get("done") ?? 0,
    oldestPendingAgeSec: parseOldestAgeSec(oldest?.oldest),
    lastTickAt: typeof hb?.at === "string" ? hb.at : null,
    lastTickCompleted: typeof hb?.completed === "number" ? hb.completed : null,
  };
}
