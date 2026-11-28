import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { templateRoutePath } from "../../../contracts/ops";
import type { KanonDb } from "../../bootstrap";
import { type AppErrorSource, appErrorEventsTable } from "../../schema";

export interface RecordAppErrorInput {
  source: AppErrorSource;
  route: string;
  code: string;
  message: string;
  requestId?: string | null;
  day?: string;
}

function normalizeErrorTemplate(raw: string): string {
  return raw
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b[0-9a-f]{16,64}\b/gi, "<hex>")
    .replace(/\+?\d[\d\s-]{5,}\d/g, "<num>")
    .replace(/\d+(?:\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function sanitizeRoute(raw: string): string {
  return templateRoutePath(raw.trim());
}

function computeFingerprint(input: {
  source: AppErrorSource;
  route: string;
  code: string;
  message: string;
}): string {
  const payload = `${input.source}|${input.route}|${input.code}|${normalizeErrorTemplate(input.message)}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/** Upserts a PII-free daily error fingerprint counter (U3-1). */
export async function recordAppErrorEvent(
  db: KanonDb,
  input: RecordAppErrorInput,
): Promise<string> {
  const route = sanitizeRoute(input.route);
  const code = input.code.trim().slice(0, 64) || "UNKNOWN";
  const day = input.day ?? new Date().toISOString().slice(0, 10);
  const fingerprint = computeFingerprint({
    source: input.source,
    route,
    code,
    message: input.message,
  });
  const sampleRequestId = input.requestId?.trim().slice(0, 64) || null;
  const now = new Date();
  await db
    .insert(appErrorEventsTable)
    .values({
      fingerprint,
      day,
      source: input.source,
      route,
      code,
      sampleRequestId,
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [appErrorEventsTable.fingerprint, appErrorEventsTable.day],
      set: {
        count: sql`${appErrorEventsTable.count} + 1`,
        lastSeenAt: now,
        ...(sampleRequestId ? { sampleRequestId } : {}),
      },
    });
  return fingerprint;
}

/** Returns total aggregated error count observed across the last 24 hours (U3-1). */
export async function countAppErrorsLast24h(db: KanonDb): Promise<number> {
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await db.execute(
    sql`SELECT COALESCE(SUM(count), 0)::int AS total FROM app_error_events WHERE last_seen_at >= ${cutoffIso}::timestamptz`,
  );
  const rows = (Array.isArray(res) ? res : res.rows) as Array<Record<string, unknown>>;
  return Number(rows[0]?.total ?? 0);
}

/** Prunes error events older than `retentionDays` (default 30d; invoked inside `prune_chunks`). */
export async function pruneOldAppErrorEvents(db: KanonDb, retentionDays = 30): Promise<number> {
  const cutoffIso = new Date(
    Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000,
  ).toISOString();
  const res = await db.execute(
    sql`DELETE FROM app_error_events WHERE last_seen_at < ${cutoffIso}::timestamptz RETURNING fingerprint`,
  );
  const rows = Array.isArray(res) ? res : res.rows;
  return rows.length;
}
