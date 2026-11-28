import { and, eq, notInArray, sql } from "drizzle-orm";
import type { CronState, HealthCron } from "../../../contracts/ops";
import type { KanonDb } from "../../bootstrap";
import { jobsTable } from "../../schema";

export const ALERT_CURSOR_JOB_ID = "sys:alert_cursor";
export const TICK_HEARTBEAT_JOB_ID = "sys:last_tick";
export const FIRST_SEEN_JOB_ID = "sys:first_seen";
export const SYSTEM_META_JOB_KINDS = ["tick_heartbeat", "alert_cursor", "first_seen"] as const;

const STALE_TICK_MS = 26 * 3600 * 1000;
const OVERRUN_GRACE_MS = 5 * 60 * 1000;
const DEFAULT_DB_QUOTA_BYTES = 512 * 1024 * 1024;
const readIso = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
const readInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

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

const jobLockWhere = (jobId: string, workerId?: string) =>
  workerId
    ? and(eq(jobsTable.id, jobId), eq(jobsTable.lockedBy, workerId))
    : eq(jobsTable.id, jobId);

async function upsertMetaJob(
  db: KanonDb,
  id: string,
  kind: (typeof SYSTEM_META_JOB_KINDS)[number],
  payload: Record<string, unknown>,
  now: Date,
): Promise<void> {
  await db
    .insert(jobsTable)
    .values({ id, kind, payload, priority: 999, runAt: now, status: "done" })
    .onConflictDoUpdate({ target: jobsTable.id, set: { payload, runAt: now, status: "done" } });
}

async function readMetaPayload(db: KanonDb, id: string): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ payload: jobsTable.payload })
    .from(jobsTable)
    .where(eq(jobsTable.id, id))
    .limit(1);
  return row?.payload ?? null;
}

export async function skipJob(db: KanonDb, jobId: string, reason: string, workerId?: string) {
  const updated = await db
    .update(jobsTable)
    .set({ status: "skipped", lockedBy: null, lockedUntil: null, lastError: reason.slice(0, 500) })
    .where(jobLockWhere(jobId, workerId))
    .returning();
  return updated.length > 0;
}

export async function requeueJobForCursor(db: KanonDb, jobId: string, workerId?: string) {
  await db
    .update(jobsTable)
    .set({
      status: "pending",
      lockedBy: null,
      lockedUntil: null,
      runAt: new Date(),
      attempts: sql`GREATEST(attempts - 1, 0)`,
    })
    .where(jobLockWhere(jobId, workerId));
}

export async function getAlertEvalCursor(db: KanonDb, day: string): Promise<string | null> {
  const payload = await readMetaPayload(db, ALERT_CURSOR_JOB_ID);
  if (!payload || payload.day !== day) return null;
  return typeof payload.afterRuleId === "string" ? payload.afterRuleId : null;
}

export async function setAlertEvalCursor(db: KanonDb, day: string, afterRuleId: string | null) {
  const now = new Date();
  const payload = afterRuleId
    ? { day, afterRuleId, updatedAt: now.toISOString() }
    : { day, afterRuleId: null };
  await upsertMetaJob(db, ALERT_CURSOR_JOB_ID, "alert_cursor", payload, now);
}

export async function ensureFirstSeen(db: KanonDb, now = new Date()): Promise<string> {
  const iso = now.toISOString();
  await db
    .insert(jobsTable)
    .values({
      id: FIRST_SEEN_JOB_ID,
      kind: "first_seen",
      payload: { at: iso },
      priority: 999,
      runAt: now,
      status: "done",
    })
    .onConflictDoNothing();
  const payload = await readMetaPayload(db, FIRST_SEEN_JOB_ID);
  return typeof payload?.at === "string" ? payload.at : iso;
}

export async function recordTickStarted(
  db: KanonDb,
  params: { workerId: string; startedAt?: Date },
) {
  const now = params.startedAt ?? new Date();
  const iso = now.toISOString();
  const prev = (await readMetaPayload(db, TICK_HEARTBEAT_JOB_ID)) ?? {};
  await upsertMetaJob(
    db,
    TICK_HEARTBEAT_JOB_ID,
    "tick_heartbeat",
    { ...prev, startedAt: iso, phase: "running", workerId: params.workerId },
    now,
  );
  return iso;
}

export async function recordTickCompleted(
  db: KanonDb,
  stats: {
    workerId: string;
    startedAt: string;
    completedAt?: Date;
    claimed: number;
    completed: number;
    failed: number;
  },
) {
  const now = stats.completedAt ?? new Date();
  const completedIso = now.toISOString();
  const payload = {
    at: completedIso,
    startedAt: stats.startedAt,
    completedAt: completedIso,
    phase: "completed",
    workerId: stats.workerId,
    claimed: stats.claimed,
    completed: stats.completed,
    failed: stats.failed,
  };
  await upsertMetaJob(db, TICK_HEARTBEAT_JOB_ID, "tick_heartbeat", payload, now);
}

function isGraceExpired(firstSeenAt: string, nowMs: number, graceHours: number): boolean {
  const firstMs = Date.parse(firstSeenAt);
  const graceMs = Math.max(0, graceHours) * 3600 * 1000;
  return Number.isFinite(firstMs) && (graceMs === 0 || nowMs - firstMs > graceMs);
}

function isTickOverrun(startedMs: number | null, completedMs: number | null, nowMs: number) {
  if (startedMs === null) return false;
  if (completedMs !== null && startedMs <= completedMs) return false;
  return nowMs - startedMs > OVERRUN_GRACE_MS;
}

function computeCronState(p: {
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  firstSeenAt: string;
  nowMs: number;
  graceHours: number;
}): CronState {
  const expired = isGraceExpired(p.firstSeenAt, p.nowMs, p.graceHours);
  if (!p.lastStartedAt && !p.lastCompletedAt) return expired ? "never_ran" : "pending_first_run";
  const startedMs = p.lastStartedAt ? Date.parse(p.lastStartedAt) : null;
  const completedMs = p.lastCompletedAt ? Date.parse(p.lastCompletedAt) : null;
  if (isTickOverrun(startedMs, completedMs, p.nowMs)) return "overrun";
  if (completedMs === null) return expired ? "overrun" : "pending_first_run";
  return p.nowMs - completedMs > STALE_TICK_MS ? "stale" : "ok";
}

export async function getCronHealth(
  db: KanonDb,
  options?: { nowMs?: number; graceHours?: number },
): Promise<HealthCron> {
  const nowMs = options?.nowMs ?? Date.now();
  const graceHours = options?.graceHours ?? 30;
  const notMeta = notInArray(jobsTable.kind, [...SYSTEM_META_JOB_KINDS]);
  const [firstSeenAt, hb, [backlogRow]] = await Promise.all([
    ensureFirstSeen(db, new Date(nowMs)),
    readMetaPayload(db, TICK_HEARTBEAT_JOB_ID),
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(jobsTable)
      .where(and(eq(jobsTable.status, "pending"), notMeta)),
  ]);
  const lastStartedAt = readIso(hb?.startedAt);
  const lastCompletedAt = readIso(hb?.completedAt) ?? readIso(hb?.at);
  return {
    state: computeCronState({ lastStartedAt, lastCompletedAt, firstSeenAt, nowMs, graceHours }),
    lastStartedAt,
    lastCompletedAt,
    lastClaimed: readInt(hb?.claimed),
    lastFailed: readInt(hb?.failed),
    backlog: Number(backlogRow?.cnt ?? 0),
  };
}

export async function getJobQueueHealth(db: KanonDb): Promise<JobQueueHealth> {
  const notMeta = notInArray(jobsTable.kind, [...SYSTEM_META_JOB_KINDS]);
  const [counts, [oldest], hb] = await Promise.all([
    db
      .select({ status: jobsTable.status, cnt: sql<number>`count(*)::int` })
      .from(jobsTable)
      .where(notMeta)
      .groupBy(jobsTable.status),
    db
      .select({ oldest: sql<string | null>`MIN(created_at)::text` })
      .from(jobsTable)
      .where(and(eq(jobsTable.status, "pending"), notMeta)),
    readMetaPayload(db, TICK_HEARTBEAT_JOB_ID),
  ]);
  const map = new Map(counts.map((r) => [r.status, Number(r.cnt ?? 0)]));
  const oldestMs = oldest?.oldest ? Date.parse(oldest.oldest) : Number.NaN;
  return {
    pending: map.get("pending") ?? 0,
    running: map.get("running") ?? 0,
    failed: map.get("failed") ?? 0,
    done: map.get("done") ?? 0,
    skipped: map.get("skipped") ?? 0,
    oldestPendingAgeSec: Number.isFinite(oldestMs)
      ? Math.max(0, Math.floor((Date.now() - oldestMs) / 1000))
      : null,
    lastTickAt: readIso(hb?.completedAt) ?? readIso(hb?.at),
    lastTickCompleted: readInt(hb?.completed),
  };
}

export async function getDbSizePct(db: KanonDb, quotaBytes = DEFAULT_DB_QUOTA_BYTES) {
  try {
    const res = await db.execute(sql`SELECT pg_database_size(current_database())::bigint AS bytes`);
    const rows = Array.isArray(res) ? res : res.rows;
    const bytes = Number((rows[0] as Record<string, unknown> | undefined)?.bytes);
    return Number.isFinite(bytes) && bytes > 0
      ? Number(((bytes / quotaBytes) * 100).toFixed(1))
      : null;
  } catch {
    return null;
  }
}
