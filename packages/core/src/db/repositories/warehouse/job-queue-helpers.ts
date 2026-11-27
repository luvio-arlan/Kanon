import { and, eq, notInArray, sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { jobsTable } from "../../schema";

export const ALERT_CURSOR_JOB_ID = "sys:alert_cursor";
export const TICK_HEARTBEAT_JOB_ID = "sys:last_tick";
export const SYSTEM_META_JOB_KINDS = ["tick_heartbeat", "alert_cursor"] as const;

export interface JobQueueHealth {
  pending: number;
  running: number;
  failed: number;
  done: number;
  skipped: number;
  oldestPendingAgeSec: number | null;
  lastTickAt: string | null;
  lastTickCompleted: number | null;
}

export async function skipJob(
  db: KanonDb,
  jobId: string,
  reason: string,
  workerId?: string,
): Promise<boolean> {
  const cond = workerId
    ? and(eq(jobsTable.id, jobId), eq(jobsTable.lockedBy, workerId))
    : eq(jobsTable.id, jobId);
  const updated = await db
    .update(jobsTable)
    .set({
      status: "skipped",
      lockedBy: null,
      lockedUntil: null,
      lastError: reason.slice(0, 500),
    })
    .where(cond)
    .returning();
  return updated.length > 0;
}

export async function requeueJobForCursor(
  db: KanonDb,
  jobId: string,
  workerId?: string,
): Promise<void> {
  const cond = workerId
    ? and(eq(jobsTable.id, jobId), eq(jobsTable.lockedBy, workerId))
    : eq(jobsTable.id, jobId);
  await db
    .update(jobsTable)
    .set({
      status: "pending",
      lockedBy: null,
      lockedUntil: null,
      runAt: new Date(),
      attempts: sql`GREATEST(attempts - 1, 0)`,
    })
    .where(cond);
}

export async function getAlertEvalCursor(db: KanonDb, day: string): Promise<string | null> {
  const [row] = await db
    .select({ payload: jobsTable.payload })
    .from(jobsTable)
    .where(eq(jobsTable.id, ALERT_CURSOR_JOB_ID))
    .limit(1);
  if (!row || row.payload.day !== day) return null;
  return typeof row.payload.afterRuleId === "string" ? row.payload.afterRuleId : null;
}

export async function setAlertEvalCursor(
  db: KanonDb,
  day: string,
  afterRuleId: string | null,
): Promise<void> {
  const now = new Date();
  const payload = afterRuleId
    ? { day, afterRuleId, updatedAt: now.toISOString() }
    : { day, afterRuleId: null };
  await db
    .insert(jobsTable)
    .values({
      id: ALERT_CURSOR_JOB_ID,
      kind: "alert_cursor",
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
  const notMeta = notInArray(jobsTable.kind, [...SYSTEM_META_JOB_KINDS]);
  const [counts, [oldest], [heartbeat]] = await Promise.all([
    db
      .select({ status: jobsTable.status, cnt: sql<number>`count(*)::int` })
      .from(jobsTable)
      .where(notMeta)
      .groupBy(jobsTable.status),
    db
      .select({ oldest: sql<string | null>`MIN(created_at)::text` })
      .from(jobsTable)
      .where(and(eq(jobsTable.status, "pending"), notMeta)),
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
    skipped: map.get("skipped") ?? 0,
    oldestPendingAgeSec: parseOldestAgeSec(oldest?.oldest),
    lastTickAt: typeof hb?.at === "string" ? hb.at : null,
    lastTickCompleted: typeof hb?.completed === "number" ? hb.completed : null,
  };
}
