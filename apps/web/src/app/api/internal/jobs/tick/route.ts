import crypto from "node:crypto";
import {
  claimDueJobs,
  completeJob,
  enqueueWatchlistJobs,
  evaluateAlertRules,
  failJobWithBackoff,
  getAlertEvalCursor,
  getJobQueueHealth,
  listChunksPendingEmbedding,
  type QueuedJobRow,
  recordTickHeartbeat,
  requeueJobForCursor,
  saveChunkEmbedding,
  setAlertEvalCursor,
  skipJob,
} from "@kanon/core/db";
import { withSystemDb } from "../../../_lib/db-context";
import { jsonError, jsonOk } from "../../../_lib/http";
import { generateRequestId, logStructuredApiEvent } from "../../../_lib/logger";
import { runSyncDailyBarsForTicker, runSyncSecForTicker } from "../../../_lib/on-demand-sync";
import { executeAlertFanoutJobInSystemDb } from "../../../_lib/sec-warehouse-sync";

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

function extractEmbeddingVectors(raw: unknown): Array<number[] | null> {
  if (!raw || typeof raw !== "object" || !("data" in raw)) return [];
  const data = (raw as { data: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    if (!item || typeof item !== "object" || !("embedding" in item)) return null;
    const emb = (item as { embedding: unknown }).embedding;
    return Array.isArray(emb) && emb.every((n) => typeof n === "number") ? emb : null;
  });
}

async function runEmbedChunksJob() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return;
  const pending = await withSystemDb("cron_tick", (tx) => listChunksPendingEmbedding(tx, 20));
  if (pending.length === 0) return;
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: pending.map((c) => c.text.slice(0, 6000)),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Embedding provider HTTP ${res.status}`);
  const vectors = extractEmbeddingVectors(await res.json());
  await withSystemDb("cron_tick", async (tx) => {
    for (let i = 0; i < pending.length; i += 1) {
      const chunk = pending[i];
      const emb = vectors[i];
      if (chunk && emb && emb.length > 0) await saveChunkEmbedding(tx, chunk.id, emb);
    }
  });
}

async function executeNonAlertJob(job: QueuedJobRow): Promise<"done" | { skipped: string }> {
  if (job.kind === "noop") return "done";
  if (job.kind === "embed_chunks") {
    await runEmbedChunksJob();
    return "done";
  }
  if (job.kind === "fanout_8k" || job.kind === "fanout_filing_redflag") {
    await executeAlertFanoutJobInSystemDb(job.kind, job.payload);
    return "done";
  }
  if (job.kind === "sync_daily_bars") {
    await runSyncDailyBarsForTicker(String(job.payload.ticker ?? ""), {
      forceFullRebase: job.payload.forceFullRebase === true,
    });
    return "done";
  }
  if (job.kind === "sync_sec") {
    const outcome = await runSyncSecForTicker(String(job.payload.ticker ?? ""));
    return outcome.status === "skipped" ? { skipped: outcome.reason } : "done";
  }
  throw new Error(`Unsupported job kind: ${job.kind}`);
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

const NON_ALERT_JOB_KINDS = [
  "sync_daily_bars",
  "sync_sec",
  "embed_chunks",
  "fanout_8k",
  "fanout_filing_redflag",
  "noop",
];

async function runFinalAlertPhase(
  workerId: string,
  day: string,
  startedAt: number,
): Promise<{ triggeredCount: number; completed: boolean; failed: boolean }> {
  const [alertJob] = await withSystemDb("cron_tick", (tx) =>
    claimDueJobs(tx, { workerId, limit: 1, leaseSeconds: 60, excludeKinds: NON_ALERT_JOB_KINDS }),
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
