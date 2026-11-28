import { CreateThesisInputSchema } from "@kanon/core";
import {
  countUserPendingJobs,
  createThesis,
  enqueueJob,
  type KanonDb,
  listGlossaryTerms,
  listTheses,
  upsertAlertRule,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../_lib/auth-session";
import {
  formatZodError,
  isUniqueConstraintError,
  jsonError,
  jsonOk,
  readJsonBody,
} from "../_lib/http";
import { generateRequestId, logStructuredApiEvent } from "../_lib/logger";
import { checkPersistentRateLimit, verifySameOrigin } from "../_lib/request-guards";
import { scheduleBackgroundAfterTask } from "../internal/jobs/tick/job-once";

export const dynamic = "force-dynamic";

const MAX_PENDING_JOBS_PER_USER = 50;
const THESIS_CREATE_RATE_POLICY = {
  bucket: "thesis_create",
  maxRequests: 10,
  windowMs: 600_000,
};

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const [theses, glossary] = await auth.withDb((tx) =>
    Promise.all([listTheses(tx, auth.user.id), listGlossaryTerms(tx)]),
  );
  return jsonOk({ theses, glossary }, startedAt);
}

function logSyncWarn(err: unknown, startedAt: number) {
  logStructuredApiEvent({
    level: "warn",
    requestId: generateRequestId(),
    route: "/api/theses",
    status: 201,
    durationMs: Math.round(performance.now() - startedAt),
    code: "ON_DEMAND_SYNC_FAILED",
    message: err instanceof Error ? err.message : String(err),
  });
}

async function enqueueInitialSyncJobs(
  tx: KanonDb,
  userId: string,
  thesisId: string,
  ticker: string,
  day: string,
): Promise<boolean> {
  const [secJob, barsJob] = await Promise.all([
    enqueueJob(tx, {
      id: `sync_sec:${ticker}:${day}`,
      kind: "sync_sec",
      payload: { ticker },
      priority: 60,
      ownerUserId: userId,
      maxAttempts: 4,
    }),
    enqueueJob(tx, {
      id: `sync_daily_bars:${ticker}:${day}`,
      kind: "sync_daily_bars",
      payload: { ticker },
      priority: 50,
      ownerUserId: userId,
      maxAttempts: 4,
    }),
    upsertAlertRule(tx, {
      userId,
      thesisId,
      kind: "form8k_redflag",
      configJson: {},
      enabled: true,
    }),
  ]);
  return secJob.inserted || barsJob.inserted;
}

function scheduleAfterSync(ticker: string, day: string, startedAt: number) {
  try {
    scheduleBackgroundAfterTask(`/api/theses/sync/${ticker}`, async () => {
      const { runSingleTickerSyncBestEffort } = await import("../_lib/on-demand-sync");
      await runSingleTickerSyncBestEffort(ticker, day);
    });
  } catch (err) {
    logSyncWarn(err, startedAt);
  }
}

async function createThesisWithSyncSchedule(
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>,
  data: ReturnType<typeof CreateThesisInputSchema.parse>,
  userId: string,
  startedAt: number,
) {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const outcome = await withDb(async (tx) => {
      if ((await countUserPendingJobs(tx, userId)) >= MAX_PENDING_JOBS_PER_USER) {
        return { kind: "quota" as const };
      }
      const thesis = await createThesis(tx, data, userId);
      const ticker = thesis.ticker.toUpperCase();
      const shouldRunAfter = await enqueueInitialSyncJobs(tx, userId, thesis.id, ticker, day).catch(
        (err) => {
          logSyncWarn(err, startedAt);
          return false;
        },
      );
      return { kind: "ok" as const, thesis, ticker, shouldRunAfter };
    });
    if (outcome.kind === "quota") {
      return jsonError(
        "后台同步队列已达配额上限，请稍后再新建标的。",
        429,
        startedAt,
        "QUEUE_QUOTA_EXCEEDED",
      );
    }
    if (outcome.shouldRunAfter) scheduleAfterSync(outcome.ticker, day, startedAt);
    return jsonOk({ thesis: outcome.thesis }, startedAt, 201);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return jsonError(
        `标的 ${data.ticker} 已在跟踪列表中，请直接进入原画布编辑。`,
        409,
        startedAt,
        "CONFLICT",
      );
    }
    return jsonError("创建标的失败，请检查输入后重试。", 500, startedAt, "CREATE_FAILED");
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const rateErr = await checkPersistentRateLimit(
    request,
    THESIS_CREATE_RATE_POLICY,
    startedAt,
    auth.user.id,
  );
  if (rateErr) return rateErr;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = CreateThesisInputSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "标的参数校验失败。"), 400, startedAt, "INVALID");
  }
  return createThesisWithSyncSchedule(auth.withDb, parsed.data, auth.user.id, startedAt);
}
