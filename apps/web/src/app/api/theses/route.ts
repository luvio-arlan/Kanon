import { CreateThesisInputSchema } from "@kanon/core";
import {
  countUserPendingJobs,
  createThesis,
  enqueueJob,
  getKanonDb,
  listGlossaryTerms,
  listTheses,
  upsertAlertRule,
} from "@kanon/core/db";
import { after } from "next/server";
import { requireWorkspaceContext } from "../_lib/auth-session";
import {
  formatZodError,
  isUniqueConstraintError,
  jsonError,
  jsonOk,
  readJsonBody,
} from "../_lib/http";
import { verifySameOrigin } from "../_lib/request-guards";

export const dynamic = "force-dynamic";

const MAX_PENDING_JOBS_PER_USER = 50;

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const db = await getKanonDb();
  const [theses, glossary] = await Promise.all([
    listTheses(db, auth.user.id),
    listGlossaryTerms(db),
  ]);
  return jsonOk({ theses, glossary }, startedAt);
}

async function scheduleInitialThesisSync(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  userId: string,
  thesisId: string,
  ticker: string,
) {
  const day = new Date().toISOString().slice(0, 10);
  await Promise.all([
    enqueueJob(db, {
      id: `sync_sec:${ticker}:${day}`,
      kind: "sync_sec",
      payload: { ticker },
      priority: 60,
      ownerUserId: userId,
      maxAttempts: 4,
    }),
    enqueueJob(db, {
      id: `sync_daily_bars:${ticker}:${day}`,
      kind: "sync_daily_bars",
      payload: { ticker },
      priority: 50,
      ownerUserId: userId,
      maxAttempts: 4,
    }),
    upsertAlertRule(db, {
      userId,
      thesisId,
      kind: "form8k_redflag",
      configJson: {},
      enabled: true,
    }),
  ]).catch(() => undefined);
  try {
    after(async () => {
      const { runSingleTickerSyncBestEffort } = await import("../_lib/on-demand-sync");
      await runSingleTickerSyncBestEffort(ticker, day);
    });
  } catch (err) {
    void err;
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = CreateThesisInputSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "标的参数校验失败。"), 400, startedAt, "INVALID");
  }
  try {
    const db = await getKanonDb();
    if ((await countUserPendingJobs(db, auth.user.id)) >= MAX_PENDING_JOBS_PER_USER) {
      return jsonError(
        "后台同步队列已达配额上限，请稍后再新建标的。",
        429,
        startedAt,
        "QUEUE_QUOTA_EXCEEDED",
      );
    }
    const thesis = await createThesis(db, parsed.data, auth.user.id);
    await scheduleInitialThesisSync(db, auth.user.id, thesis.id, thesis.ticker.toUpperCase());
    return jsonOk({ thesis }, startedAt, 201);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return jsonError(
        `标的 ${parsed.data.ticker} 已在跟踪列表中，请直接进入原画布编辑。`,
        409,
        startedAt,
        "CONFLICT",
      );
    }
    return jsonError("创建标的失败，请检查输入后重试。", 500, startedAt, "CREATE_FAILED");
  }
}
