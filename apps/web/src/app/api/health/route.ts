import {
  HealthResponseSchema,
  isCredentialsMasterKeyConfigured,
  parseCronGraceHours,
} from "@kanon/core";
import {
  countAppErrorsLast24h,
  getCronHealth,
  getDbSecurityPosture,
  getDbSizePct,
  getJobQueueHealth,
  MigrationsPendingError,
  pingKanonDb,
} from "@kanon/core/db";
import { withSystemDb } from "../_lib/db-context";
import { jsonError, jsonOk, resolveRequestId } from "../_lib/http";
import { logStructuredApiEvent } from "../_lib/logger";

export const dynamic = "force-dynamic";

const MAX_QUEUE_AGE_SEC = 26 * 3600;

function deriveHealthStatus(input: {
  oldestPendingAgeSec: number | null;
  cronState: string;
  dbSizePct: number | null;
  bypassRls: boolean;
  rlsFailClosed: boolean;
}): "healthy" | "degraded" {
  const pendingStale =
    input.oldestPendingAgeSec != null && input.oldestPendingAgeSec > MAX_QUEUE_AGE_SEC;
  const cronDegraded =
    input.cronState === "never_ran" || input.cronState === "overrun" || input.cronState === "stale";
  const storageDegraded = input.dbSizePct !== null && input.dbSizePct > 70;
  const isProd = process.env.VERCEL_ENV === "production";
  const rlsDegraded = isProd && (input.bypassRls || !input.rlsFailClosed);
  return pendingStale || cronDegraded || storageDegraded || rlsDegraded ? "degraded" : "healthy";
}

function handleHealthError(err: unknown, startedAt: number, requestId: string) {
  if (err instanceof MigrationsPendingError) {
    return jsonError("数据库迁移尚未完成。", 503, startedAt, "MIGRATIONS_PENDING", requestId);
  }
  const detail = err instanceof Error ? err.message : String(err);
  logStructuredApiEvent({
    level: "error",
    requestId,
    route: "/api/health",
    status: 503,
    durationMs: Math.round(performance.now() - startedAt),
    code: "DB_UNAVAILABLE",
    message: detail.slice(0, 240),
  });
  return jsonError("数据库连接自检失败。", 503, startedAt, "DB_UNAVAILABLE", requestId);
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const requestId = resolveRequestId(request);
  try {
    const graceHours = parseCronGraceHours(process.env.KANON_CRON_GRACE_HOURS);
    const snapshot = await withSystemDb(
      "health",
      async (tx) => {
        await pingKanonDb(tx);
        const [jobQueue, cron, db, dbSizePct, errors24h] = await Promise.all([
          getJobQueueHealth(tx),
          getCronHealth(tx, { graceHours }),
          getDbSecurityPosture(tx),
          getDbSizePct(tx),
          countAppErrorsLast24h(tx),
        ]);
        return { jobQueue, cron, db, dbSizePct, errors24h };
      },
      requestId,
    );
    const secUserAgentConfigured = Boolean(process.env.KANON_SEC_USER_AGENT?.trim());
    const status = deriveHealthStatus({
      oldestPendingAgeSec: snapshot.jobQueue.oldestPendingAgeSec,
      cronState: snapshot.cron.state,
      dbSizePct: snapshot.dbSizePct,
      bypassRls: snapshot.db.bypassRls,
      rlsFailClosed: snapshot.db.rlsFailClosed,
    });
    const body = HealthResponseSchema.parse({
      status,
      timestamp: new Date().toISOString(),
      secUserAgentConfigured,
      secretsConfigured: {
        credentials: isCredentialsMasterKeyConfigured(),
        cron: Boolean(process.env.CRON_SECRET?.trim()),
        secUserAgent: secUserAgentConfigured,
      },
      ...snapshot,
    });
    return jsonOk(body, startedAt, 200, requestId);
  } catch (err) {
    return handleHealthError(err, startedAt, requestId);
  }
}
