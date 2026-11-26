import crypto from "node:crypto";
import { fetchDailyPriceBars, fetchPolygonSplits, fetchSecEdgarWithPitFacts } from "@kanon/ai";
import {
  claimDueJobs,
  completeJob,
  enqueueWatchlistJobs,
  evaluateAlertRules,
  failJobWithBackoff,
  getJobQueueHealth,
  getKanonDb,
  getSecurityByTicker,
  type KanonDb,
  type QueuedJobRow,
  recordCorporateAction,
  upsertPriceBars,
  upsertSecSnapshot,
  upsertSecurity,
} from "@kanon/core/db";
import { jsonError, jsonOk } from "../../../_lib/http";
import { generateRequestId, logStructuredApiEvent } from "../../../_lib/logger";
import { syncSecSnapshotToWarehouse } from "../../../_lib/sec-warehouse-sync";

export const dynamic = "force-dynamic";

const TICK_BUDGET_MS = 45_000;

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

async function runSyncDailyBarsJob(db: KanonDb, payload: Record<string, unknown>) {
  const ticker = String(payload.ticker ?? "")
    .trim()
    .toUpperCase();
  if (!ticker) throw new Error("Missing ticker in sync_daily_bars payload");
  const existing = await getSecurityByTicker(db, ticker);
  const security = existing ?? (await upsertSecurity(db, { ticker, name: ticker }));
  const [bars, splits] = await Promise.all([
    fetchDailyPriceBars({ ticker, range: "5y" }),
    fetchPolygonSplits({ ticker }),
  ]);
  if (bars.length > 0) {
    await upsertPriceBars(
      db,
      bars.map((b) => ({ ...b, securityId: security.id })),
    );
  }
  for (const sp of splits) {
    await recordCorporateAction(db, {
      id: `split:${security.id}:${sp.exDate}`,
      securityId: security.id,
      exDate: sp.exDate,
      kind: "split",
      ratio: sp.ratio,
    });
  }
}

async function runSyncSecJob(db: KanonDb, payload: Record<string, unknown>) {
  const ticker = String(payload.ticker ?? "")
    .trim()
    .toUpperCase();
  if (!ticker) throw new Error("Missing ticker in sync_sec payload");
  const fetched = await fetchSecEdgarWithPitFacts(ticker);
  if (!fetched.ok) throw new Error(fetched.error);
  const saved = await upsertSecSnapshot(db, fetched.data);
  await syncSecSnapshotToWarehouse(db, saved, undefined, fetched.pitFacts);
}

async function executeJob(db: KanonDb, job: QueuedJobRow): Promise<void> {
  if (job.kind === "noop") return;
  if (job.kind === "evaluate_alerts") {
    await evaluateAlertRules(db);
    return;
  }
  if (job.kind === "sync_daily_bars") return runSyncDailyBarsJob(db, job.payload);
  if (job.kind === "sync_sec") return runSyncSecJob(db, job.payload);
  throw new Error(`Unsupported job kind: ${job.kind}`);
}

async function runSingleJob(db: KanonDb, job: QueuedJobRow, workerId: string, startedAt: number) {
  try {
    await executeJob(db, job);
    await completeJob(db, job.id, workerId);
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

export async function GET(request: Request) {
  return POST(request);
}

async function drainJobQueue(db: KanonDb, workerId: string, startedAt: number) {
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  while (performance.now() - startedAt < TICK_BUDGET_MS) {
    const jobs = await claimDueJobs(db, { workerId, limit: 25, leaseSeconds: 120 });
    if (jobs.length === 0) break;
    claimed += jobs.length;
    for (const job of jobs) {
      if (performance.now() - startedAt >= TICK_BUDGET_MS) break;
      const ok = await runSingleJob(db, job, workerId, startedAt);
      if (ok) completed += 1;
      else failed += 1;
    }
  }
  return { claimed, completed, failed };
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const authErr = verifyCronSecret(request, startedAt);
  if (authErr) return authErr;

  const db = await getKanonDb();
  const workerId = `tick_${crypto.randomUUID().slice(0, 8)}`;
  const enqueued = await enqueueWatchlistJobs(db);
  const { claimed, completed, failed } = await drainJobQueue(db, workerId, startedAt);
  const queueHealth = await getJobQueueHealth(db);
  return jsonOk({ workerId, enqueued, claimed, completed, failed, queueHealth }, startedAt);
}
