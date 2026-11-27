import crypto from "node:crypto";
import {
  claimDueJobs,
  completeJob,
  enqueueWatchlistJobs,
  evaluateAlertRules,
  failJobWithBackoff,
  getAlertEvalCursor,
  getJobQueueHealth,
  type QueuedJobRow,
  recordTickHeartbeat,
  requeueJobForCursor,
  setAlertEvalCursor,
  skipJob,
} from "@kanon/core/db";
import { withSystemDb } from "../../../_lib/db-context";
import { jsonError, jsonOk } from "../../../_lib/http";
import { generateRequestId, logStructuredApiEvent } from "../../../_lib/logger";
import { executeNonAlertJob, NON_ALERT_JOB_KINDS } from "./job-handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALERT_EVAL_BUDGET_MS = 15_000;
const TICK_BUDGET_MS = maxDuration * 1000 - ALERT_EVAL_BUDGET_MS - 5_000;

function verifyCronSecret(request: Request, startedAt: number): Response | null {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return jsonError("未配置 CRON_SECRET，后台任务通道已关闭。", 503, startedAt, "CRON_DISABLED");
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return jsonError("Cron 认证令牌无效。", 401, startedAt, "UNAUTHORIZED");
  }
  return null;
}

async function runSingleJob(job: QueuedJobRow, workerId: string, startedAt: number) {
  try {
    const outcome = await executeNonAlertJob(job);
    if (outcome !== "done") {
      await withSystemDb("cron_tick", (tx) => skipJob(tx, job.id, outcome.skipped, workerId));
    } else {
      await withSystemDb("cron_tick", (tx) => completeJob(tx, job.id, workerId));
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await withSystemDb("cron_tick", (tx) => failJobWithBackoff(tx, job.id, msg, workerId));
    logStructuredApiEvent({
      level: "warn",
      requestId: generateRequestId(),
      route: "/api/internal/jobs/tick",
      status: 500,
      durationMs: Math.round(performance.now() - startedAt),
      code: job.kind,
      message: msg,
    });
    return false;
  }
}

async function drainSyncQueue(workerId: string, startedAt: number) {
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  while (performance.now() - startedAt < TICK_BUDGET_MS) {
    const [job] = await withSystemDb("cron_tick", (tx) =>
      claimDueJobs(tx, {
        workerId,
        limit: 1,
        leaseSeconds: 120,
        excludeKinds: ["evaluate_alerts"],
      }),
    );
    if (!job) break;
    claimed += 1;
    if (await runSingleJob(job, workerId, startedAt)) completed += 1;
    else failed += 1;
  }
  return { claimed, completed, failed };
}

async function runFinalAlertPhase(
  workerId: string,
  day: string,
  startedAt: number,
): Promise<{ triggeredCount: number; completed: boolean; failed: boolean }> {
  const [alertJob] = await withSystemDb("cron_tick", (tx) =>
    claimDueJobs(tx, {
      workerId,
      limit: 1,
      leaseSeconds: 60,
      excludeKinds: [...NON_ALERT_JOB_KINDS],
    }),
  );
  const jobId = alertJob?.id ?? `evaluate_alerts:${day}`;
  const lockOwner = alertJob ? workerId : undefined;
  try {
    return await withSystemDb("cron_tick", async (tx) => {
      const cursor = await getAlertEvalCursor(tx, day);
      const summary = await evaluateAlertRules(tx, {
        budgetMs: ALERT_EVAL_BUDGET_MS,
        afterRuleId: cursor,
      });
      if (!summary.completed) {
        await setAlertEvalCursor(tx, day, summary.nextCursor);
        await requeueJobForCursor(tx, jobId, lockOwner);
        return { triggeredCount: summary.triggeredCount, completed: false, failed: false };
      }
      await setAlertEvalCursor(tx, day, null);
      await completeJob(tx, jobId, lockOwner);
      return { triggeredCount: summary.triggeredCount, completed: true, failed: false };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await withSystemDb("cron_tick", (tx) => failJobWithBackoff(tx, jobId, msg, lockOwner));
    logStructuredApiEvent({
      level: "warn",
      requestId: generateRequestId(),
      route: "/api/internal/jobs/tick",
      status: 500,
      durationMs: Math.round(performance.now() - startedAt),
      code: "evaluate_alerts",
      message: msg,
    });
    return { triggeredCount: 0, completed: false, failed: true };
  }
}

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const authErr = verifyCronSecret(request, startedAt);
  if (authErr) return authErr;

  const workerId = `tick_${crypto.randomUUID().slice(0, 8)}`;
  const day = new Date().toISOString().slice(0, 10);
  const enqueued = await withSystemDb("cron_tick", (tx) => enqueueWatchlistJobs(tx, day));
  const syncStats = await drainSyncQueue(workerId, startedAt);
  const alertStats = await runFinalAlertPhase(workerId, day, startedAt);
  const completed = syncStats.completed + (alertStats.completed ? 1 : 0);
  const failed = syncStats.failed + (alertStats.failed ? 1 : 0);
  await withSystemDb("cron_tick", (tx) =>
    recordTickHeartbeat(tx, { claimed: syncStats.claimed + 1, completed, failed }),
  ).catch(() => undefined);
  const queueHealth = await withSystemDb("cron_tick", (tx) => getJobQueueHealth(tx));
  return jsonOk(
    {
      workerId,
      enqueued,
      claimed: syncStats.claimed + 1,
      completed,
      failed,
      alertsTriggered: alertStats.triggeredCount,
      queueHealth,
    },
    startedAt,
  );
}
