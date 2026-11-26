import crypto from "node:crypto";
import { fetchDailyPriceBars } from "@kanon/ai";
import {
  claimDueJobs,
  completeJob,
  failJobWithBackoff,
  getKanonDb,
  getSecurityByTicker,
  type KanonDb,
  type QueuedJobRow,
  upsertPriceBars,
  upsertSecurity,
} from "@kanon/core/db";
import { jsonError, jsonOk } from "../../../_lib/http";
import { generateRequestId, logStructuredApiEvent } from "../../../_lib/logger";

export const dynamic = "force-dynamic";

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

async function executeJob(db: KanonDb, job: QueuedJobRow): Promise<void> {
  if (job.kind === "noop") return;
  if (job.kind === "sync_daily_bars") {
    const ticker = String(job.payload.ticker ?? "")
      .trim()
      .toUpperCase();
    if (!ticker) throw new Error("Missing ticker in sync_daily_bars payload");
    const existing = await getSecurityByTicker(db, ticker);
    const security = existing ?? (await upsertSecurity(db, { ticker, name: ticker }));
    const bars = await fetchDailyPriceBars({ ticker, range: "5y" });
    if (bars.length > 0) {
      await upsertPriceBars(
        db,
        bars.map((b) => ({ ...b, securityId: security.id })),
      );
    }
    return;
  }
  throw new Error(`Unsupported job kind: ${job.kind}`);
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
  const jobs = await claimDueJobs(db, { workerId, limit: 5, leaseSeconds: 120 });
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await executeJob(db, job);
      await completeJob(db, job.id);
      completed += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await failJobWithBackoff(db, job.id, msg);
      failed += 1;
      logStructuredApiEvent({
        level: "warn",
        requestId: generateRequestId(),
        route: "/api/internal/jobs/tick",
        status: 500,
        durationMs: Math.round(performance.now() - startedAt),
        code: job.kind,
        message: msg,
      });
    }
  }

  return jsonOk({ workerId, claimed: jobs.length, completed, failed }, startedAt);
}
