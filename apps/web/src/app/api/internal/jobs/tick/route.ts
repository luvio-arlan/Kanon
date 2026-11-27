import crypto from "node:crypto";
import {
  claimDueJobs,
  completeJob,
  enqueueWatchlistJobs,
  evaluateAlertRules,
  failJobWithBackoff,
  getAlertEvalCursor,
  getJobQueueHealth,
  getKanonDb,
  type KanonDb,
  listChunksPendingEmbedding,
  type QueuedJobRow,
  recordTickHeartbeat,
  requeueJobForCursor,
  saveChunkEmbedding,
  setAlertEvalCursor,
  skipJob,
} from "@kanon/core/db";
import { jsonError, jsonOk } from "../../../_lib/http";
import { generateRequestId, logStructuredApiEvent } from "../../../_lib/logger";
import { runSyncDailyBarsForTicker, runSyncSecForTicker } from "../../../_lib/on-demand-sync";

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

async function runEmbedChunksJob(db: KanonDb) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return;
  const pending = await listChunksPendingEmbedding(db, 20);
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
  for (let i = 0; i < pending.length; i += 1) {
    const chunk = pending[i];
    const emb = vectors[i];
    if (chunk && emb && emb.length > 0) await saveChunkEmbedding(db, chunk.id, emb);
  }
}

async function executeNonAlertJob(
  db: KanonDb,
  job: QueuedJobRow,
): Promise<"done" | { skipped: string }> {
  if (job.kind === "noop") return "done";
  if (job.kind === "embed_chunks") {
    await runEmbedChunksJob(db);
    return "done";
  }
  if (job.kind === "sync_daily_bars") {
    await runSyncDailyBarsForTicker(db, String(job.payload.ticker ?? ""), {
      forceFullRebase: job.payload.forceFullRebase === true,
    });
    return "done";
  }
  if (job.kind === "sync_sec") {
    const outcome = await runSyncSecForTicker(db, String(job.payload.ticker ?? ""));
    return outcome.status === "skipped" ? { skipped: outcome.reason } : "done";
  }
  throw new Error(`Unsupported job kind: ${job.kind}`);
}

async function runSingleJob(db: KanonDb, job: QueuedJobRow, workerId: string, startedAt: number) {
  try {
    const outcome = await executeNonAlertJob(db, job);
    if (outcome !== "done") await skipJob(db, job.id, outcome.skipped, workerId);
    else await completeJob(db, job.id, workerId);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobWithBackoff(db, job.id, msg, workerId);
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

async function drainSyncQueue(db: KanonDb, workerId: string, startedAt: number) {
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  while (performance.now() - startedAt < TICK_BUDGET_MS) {
    const [job] = await claimDueJobs(db, {
      workerId,
      limit: 1,
      leaseSeconds: 120,
      excludeKinds: ["evaluate_alerts"],
    });
    if (!job) break;
    claimed += 1;
    if (await runSingleJob(db, job, workerId, startedAt)) completed += 1;
    else failed += 1;
  }
  return { claimed, completed, failed };
}

async function runFinalAlertPhase(
  db: KanonDb,
  workerId: string,
  day: string,
  startedAt: number,
): Promise<{ triggeredCount: number; completed: boolean; failed: boolean }> {
  const [alertJob] = await claimDueJobs(db, {
    workerId,
    limit: 1,
    leaseSeconds: 60,
    excludeKinds: ["sync_daily_bars", "sync_sec", "embed_chunks", "noop"],
  });
  const jobId = alertJob?.id ?? `evaluate_alerts:${day}`;
  try {
    const cursor = await getAlertEvalCursor(db, day);
    const summary = await evaluateAlertRules(db, {
      budgetMs: ALERT_EVAL_BUDGET_MS,
      afterRuleId: cursor,
    });
    if (!summary.completed) {
      await setAlertEvalCursor(db, day, summary.nextCursor);
      await requeueJobForCursor(db, jobId, alertJob ? workerId : undefined);
      return { triggeredCount: summary.triggeredCount, completed: false, failed: false };
    }
    await setAlertEvalCursor(db, day, null);
    await completeJob(db, jobId, alertJob ? workerId : undefined);
    return { triggeredCount: summary.triggeredCount, completed: true, failed: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobWithBackoff(db, jobId, msg, alertJob ? workerId : undefined);
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

  const db = await getKanonDb();
  const workerId = `tick_${crypto.randomUUID().slice(0, 8)}`;
  const day = new Date().toISOString().slice(0, 10);
  const enqueued = await enqueueWatchlistJobs(db, day);
  const syncStats = await drainSyncQueue(db, workerId, startedAt);
  const alertStats = await runFinalAlertPhase(db, workerId, day, startedAt);
  const completed = syncStats.completed + (alertStats.completed ? 1 : 0);
  const failed = syncStats.failed + (alertStats.failed ? 1 : 0);
  await recordTickHeartbeat(db, { claimed: syncStats.claimed + 1, completed, failed }).catch(
    () => undefined,
  );
  const queueHealth = await getJobQueueHealth(db);
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
