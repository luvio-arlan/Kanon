import {
  HealthResponseSchema,
  isCredentialsMasterKeyConfigured,
  parseCronGraceHours,
} from "@kanon/core";
import {
  getCronHealth,
  getDbSecurityPosture,
  getDbSizePct,
  getJobQueueHealth,
  MigrationsPendingError,
  pingKanonDb,
} from "@kanon/core/db";
import { withSystemDb } from "../_lib/db-context";
import { jsonError, jsonOk } from "../_lib/http";

export const dynamic = "force-dynamic";

const MAX_QUEUE_AGE_SEC = 26 * 3600;

export async function GET() {
  const startedAt = performance.now();
  try {
    const graceHours = parseCronGraceHours(process.env.KANON_CRON_GRACE_HOURS);
    const { jobQueue, cron, db, dbSizePct } = await withSystemDb("health", async (tx) => {
      await pingKanonDb(tx);
      const [queue, cronHealth, dbPosture, sizePct] = await Promise.all([
        getJobQueueHealth(tx),
        getCronHealth(tx, { graceHours }),
        getDbSecurityPosture(tx),
        getDbSizePct(tx),
      ]);
      return { jobQueue: queue, cron: cronHealth, db: dbPosture, dbSizePct: sizePct };
    });
    const secUserAgentConfigured = Boolean(process.env.KANON_SEC_USER_AGENT?.trim());
    const secretsConfigured = {
      credentials: isCredentialsMasterKeyConfigured(),
      cron: Boolean(process.env.CRON_SECRET?.trim()),
      secUserAgent: secUserAgentConfigured,
    };
    const pendingStale =
      jobQueue.oldestPendingAgeSec != null && jobQueue.oldestPendingAgeSec > MAX_QUEUE_AGE_SEC;
    const cronDegraded =
      cron.state === "never_ran" || cron.state === "overrun" || cron.state === "stale";
    const storageDegraded = dbSizePct !== null && dbSizePct > 70;
    const isProd = process.env.VERCEL_ENV === "production";
    const rlsDegraded = isProd && (db.bypassRls || !db.rlsFailClosed);
    const status =
      pendingStale || cronDegraded || storageDegraded || rlsDegraded ? "degraded" : "healthy";
    const body = HealthResponseSchema.parse({
      status,
      timestamp: new Date().toISOString(),
      secUserAgentConfigured,
      secretsConfigured,
      jobQueue,
      cron,
      db,
      dbSizePct,
    });
    return jsonOk(body, startedAt);
  } catch (err) {
    if (err instanceof MigrationsPendingError) {
      return jsonError("数据库迁移尚未完成。", 503, startedAt, "MIGRATIONS_PENDING");
    }
    return jsonError("数据库连接自检失败。", 503, startedAt, "DB_UNAVAILABLE");
  }
}
