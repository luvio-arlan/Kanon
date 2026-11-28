import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { type JobStatus, jobsTable } from "../../schema";
import { SYSTEM_META_JOB_KINDS } from "./job-queue-helpers";

export {
  ALERT_CURSOR_JOB_ID,
  ensureFirstSeen,
  FIRST_SEEN_JOB_ID,
  getAlertEvalCursor,
  getCronHealth,
  getDbSizePct,
  getJobQueueHealth,
  type JobQueueHealth,
  recordTickCompleted,
  recordTickStarted,
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

export async function getJobById(db: KanonDb, jobId: string): Promise<QueuedJobRow | null> {
  const [row] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    payload: row.payload ?? {},
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    status: row.status,
    lastError: row.lastError ?? null,
  };
}

export async function countUserPendingJobs(db: KanonDb, userId: string): Promise<number> {
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(jobsTable)
    .where(and(eq(jobsTable.ownerUserId, userId), eq(jobsTable.status, "pending")));
  return Number(row?.cnt ?? 0);
}

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

/** Atomically claims a specific job by ID if pending/expired so on-demand & cron share one lease (U0-4). */
export async function claimJobById(
  db: KanonDb,
  params: { jobId: string; workerId: string; leaseSeconds?: number },
): Promise<QueuedJobRow | null> {
  const leaseSec = Math.max(15, Math.min(600, params.leaseSeconds ?? 120));
  const res = await db.execute(sql`
    UPDATE jobs
    SET status = 'running',
        locked_by = ${params.workerId},
        locked_until = NOW() + (${leaseSec} * INTERVAL '1 second'),
        attempts = attempts + 1
    WHERE id = ${params.jobId}
      AND attempts < max_attempts
      AND ((status = 'pending' AND run_at <= NOW())
        OR (status = 'running' AND locked_until IS NOT NULL AND locked_until < NOW()))
    RETURNING id, kind, payload, priority, attempts, max_attempts, status, last_error
  `);
  const rawRows = (Array.isArray(res) ? res : res.rows) as Record<string, unknown>[];
  return rawRows[0] ? mapRawJobRow(rawRows[0]) : null;
}

export async function claimDueJobs(
  db: KanonDb,
  params: {
    workerId: string;
    limit?: number;
    leaseSeconds?: number;
    excludeKinds?: readonly string[];
    /** Allowlist: when set, ONLY these kinds are claimable (never claim work you cannot run). */
    onlyKinds?: readonly string[];
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
  const onlySql = params.onlyKinds?.length
    ? sql`AND kind IN (${sql.join(
        params.onlyKinds.map((k) => sql`${k}`),
        sql`, `,
      )})`
    : sql``;
  const res = await db.execute(sql`
    WITH due AS (
      SELECT id FROM jobs
      WHERE kind NOT IN (${excludedSql}) ${onlySql} AND attempts < max_attempts
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
