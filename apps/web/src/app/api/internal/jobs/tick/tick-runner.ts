import crypto from "node:crypto";
import {
  claimDueJobs,
  completeJob,
  enqueueWatchlistJobs,
  evaluateAlertRules,
  failJobWithBackoff,
  getAlertEvalCursor,
  getCronHealth,
  getJobQueueHealth,
  type QueuedJobRow,
  recordAppErrorEvent,
  recordTickCompleted,
  recordTickStarted,
  requeueJobForCursor,
  setAlertEvalCursor,
  skipJob,
} from "@kanon/core/db";
import { withSystemDb } from "../../../_lib/db-context";
import { generateRequestId, logStructuredApiEvent } from "../../../_lib/logger";
import {
  estimateJobCostMs,
  executeNonAlertJob,
  type JobRunner,
  NON_ALERT_JOB_KINDS,
} from "./job-handlers";

const ALERT_EVAL_BUDGET_MS = 15_000;
const DEFAULT_TICK_BUDGET_MS = 40_000;

function computeExcludedKindsForBudget(remainingMs: number): string[] {
  const excluded: string[] = ["evaluate_alerts"];
  for (const kind of NON_ALERT_JOB_KINDS) {
    if (estimateJobCostMs(kind) > remainingMs) excluded.push(kind);
  }
  return excluded;
}

/**
 * Persists a job failure, THEN best-effort telemetry in a separate transaction: an observability write can
 * never roll back the job state machine or abort the tick (V2-3 / G39).
 */
async function recordJobFailure(params: {
  jobId: string;
  code: string;
  lockOwner?: string;
  startedAtPerf: number;
  err: unknown;
}) {
  const msg = params.err instanceof Error ? params.err.message : String(params.err);
  const requestId = generateRequestId();
  await withSystemDb(
    "cron_tick",
    (tx) => failJobWithBackoff(tx, params.jobId, msg, params.lockOwner),
    requestId,
  );
  await withSystemDb(
    "cron_tick",
    (tx) =>
      recordAppErrorEvent(tx, {
        source: "job",
        route: "/api/internal/jobs/tick",
        code: params.code,
        message: msg,
        requestId,
      }),
    requestId,
  ).catch(() => undefined);
  logStructuredApiEvent({
    level: "warn",
    requestId,
    route: "/api/internal/jobs/tick",
    status: 500,
    durationMs: Math.round(performance.now() - params.startedAtPerf),
    code: params.code,
    message: msg,
  });
}

async function runSingleJobWithDeadline(
  job: QueuedJobRow,
  workerId: string,
  startedAtPerf: number,
  remainingMs: number,
  runner: JobRunner,
): Promise<boolean> {
  const signal = AbortSignal.timeout(Math.max(1_000, Math.floor(remainingMs)));
  try {
    const outcome = await runner(job, signal);
    if (outcome !== "done") {
      await withSystemDb("cron_tick", (tx) => skipJob(tx, job.id, outcome.skipped, workerId));
    } else {
      await withSystemDb("cron_tick", (tx) => completeJob(tx, job.id, workerId));
    }
    return true;
  } catch (err) {
    await recordJobFailure({
      jobId: job.id,
      code: job.kind,
      lockOwner: workerId,
      startedAtPerf,
      err,
    });
    return false;
  }
}

async function drainSyncQueue(params: {
  workerId: string;
  startedAtPerf: number;
  budgetMs: number;
  runner: JobRunner;
}) {
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  const deadline = params.startedAtPerf + params.budgetMs;
  while (true) {
    const remainingMs = deadline - performance.now();
    if (remainingMs < 1_000) break;
    const excludeKinds = computeExcludedKindsForBudget(remainingMs);
    if (excludeKinds.length >= NON_ALERT_JOB_KINDS.length + 1) break;
    const [job] = await withSystemDb("cron_tick", (tx) =>
      claimDueJobs(tx, { workerId: params.workerId, limit: 1, leaseSeconds: 120, excludeKinds }),
    );
    if (!job) break;
    claimed += 1;
    const jobBudget = Math.max(1_000, deadline - performance.now());
    const ok = await runSingleJobWithDeadline(
      job,
      params.workerId,
      params.startedAtPerf,
      jobBudget,
      params.runner,
    );
    if (ok) completed += 1;
    else failed += 1;
  }
  return { claimed, completed, failed };
}

async function runFinalAlertPhase(
  workerId: string,
  day: string,
  startedAtPerf: number,
): Promise<{ triggeredCount: number; completed: boolean; failed: boolean }> {
  const [alertJob] = await withSystemDb("cron_tick", (tx) =>
    claimDueJobs(tx, { workerId, limit: 1, leaseSeconds: 60, onlyKinds: ["evaluate_alerts"] }),
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
    await recordJobFailure({ jobId, code: "evaluate_alerts", lockOwner, startedAtPerf, err });
    return { triggeredCount: 0, completed: false, failed: true };
  }
}

/** Executes the full heartbeat-bracketed cron tick cycle with per-job AbortSignal deadlines (U0-2). */
export async function runCronTick(options?: {
  budgetMs?: number;
  runner?: JobRunner;
  day?: string;
}) {
  const startedAtPerf = performance.now();
  const workerId = `tick_${crypto.randomUUID().slice(0, 8)}`;
  const day = options?.day ?? new Date().toISOString().slice(0, 10);
  const startedIso = await withSystemDb("cron_tick", (tx) => recordTickStarted(tx, { workerId }));
  const enqueued = await withSystemDb("cron_tick", (tx) => enqueueWatchlistJobs(tx, day));
  const syncStats = await drainSyncQueue({
    workerId,
    startedAtPerf,
    budgetMs: options?.budgetMs ?? DEFAULT_TICK_BUDGET_MS,
    runner: options?.runner ?? executeNonAlertJob,
  });
  const alertStats = await runFinalAlertPhase(workerId, day, startedAtPerf);
  const completed = syncStats.completed + (alertStats.completed ? 1 : 0);
  const failed = syncStats.failed + (alertStats.failed ? 1 : 0);
  const claimed = syncStats.claimed + 1;
  await withSystemDb("cron_tick", (tx) =>
    recordTickCompleted(tx, { workerId, startedAt: startedIso, claimed, completed, failed }),
  );
  const { queueHealth, cron } = await withSystemDb("cron_tick", async (tx) => ({
    queueHealth: await getJobQueueHealth(tx),
    cron: await getCronHealth(tx),
  }));
  return {
    workerId,
    enqueued,
    claimed,
    completed,
    failed,
    alertsTriggered: alertStats.triggeredCount,
    queueHealth,
    cron,
  };
}
