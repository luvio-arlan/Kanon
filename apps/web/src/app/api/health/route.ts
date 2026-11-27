import { isCredentialsMasterKeyConfigured } from "@kanon/core";
import { getJobQueueHealth, MigrationsPendingError, pingKanonDb } from "@kanon/core/db";
import { withSystemDb } from "../_lib/db-context";
import { jsonError, jsonOk } from "../_lib/http";

export const dynamic = "force-dynamic";

const MAX_QUEUE_AGE_SEC = 26 * 3600;

export async function GET() {
  const startedAt = performance.now();
  try {
    const jobQueue = await withSystemDb("health", async (tx) => {
      await pingKanonDb(tx);
      return getJobQueueHealth(tx).catch(() => null);
    });
    const secUserAgentConfigured = Boolean(process.env.KANON_SEC_USER_AGENT?.trim());
    const secretsConfigured = {
      credentials: isCredentialsMasterKeyConfigured(),
      cron: Boolean(process.env.CRON_SECRET?.trim()),
      secUserAgent: secUserAgentConfigured,
    };
    const pendingStale =
      jobQueue?.oldestPendingAgeSec != null && jobQueue.oldestPendingAgeSec > MAX_QUEUE_AGE_SEC;
    const tickStale =
      jobQueue?.lastTickAt != null &&
      Date.now() - Date.parse(jobQueue.lastTickAt) > MAX_QUEUE_AGE_SEC * 1000;
    const status = pendingStale || tickStale ? "degraded" : "healthy";
    return jsonOk(
      {
        status,
        timestamp: new Date().toISOString(),
        secUserAgentConfigured,
        secretsConfigured,
        jobQueue,
      },
      startedAt,
    );
  } catch (err) {
    if (err instanceof MigrationsPendingError) {
      return jsonError("数据库迁移尚未完成。", 503, startedAt, "MIGRATIONS_PENDING");
    }
    return jsonError("数据库连接自检失败。", 503, startedAt, "DB_UNAVAILABLE");
  }
}
