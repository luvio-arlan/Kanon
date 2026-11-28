import { CopilotRequestSchema, runThesisCopilot } from "@kanon/ai";
import { getSecSnapshot, getThesisById, recordAiUsage, upsertCopilotOutput } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import {
  buildAiUsageEntry,
  checkHostedAiQuota,
  resolveEffectiveByok,
} from "../../_lib/byok-headers";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../_lib/request-guards";
import { requireThesisAccess } from "../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

const COPILOT_RATE_POLICY = { bucket: "ai_copilot", maxRequests: 20, windowMs: 60 * 1000 };

async function executeAndSaveCopilot(params: {
  withDb: <T>(fn: (tx: import("@kanon/core/db").KanonDb) => Promise<T>) => Promise<T>;
  userId: string;
  action: "earnings_digest" | "red_team" | "investment_memo";
  sourceText?: string;
  thesis: NonNullable<Awaited<ReturnType<typeof getThesisById>>>;
  secSnapshot: Awaited<ReturnType<typeof getSecSnapshot>>;
  byok: Awaited<ReturnType<typeof resolveEffectiveByok>>;
}) {
  const result = await runThesisCopilot({
    action: params.action,
    thesis: params.thesis,
    secSnapshot: params.secSnapshot,
    sourceText: params.sourceText,
    byok: params.byok,
  });
  const usageEntry = await buildAiUsageEntry({
    userId: params.userId,
    thesisId: params.thesis.id,
    route: "/api/ai/copilot",
    engine: result.engine,
    byok: params.byok,
    usage: result.usage,
  });
  await params.withDb(async (tx) => {
    await Promise.all([
      upsertCopilotOutput(tx, params.thesis.id, {
        action: result.action,
        engine: result.engine,
        payload: result.data,
      }),
      recordAiUsage(tx, usageEntry).catch(() => undefined),
    ]);
  });
  return result;
}

async function loadCopilotInputsInTx(
  tx: import("@kanon/core/db").KanonDb,
  thesisId: string,
  userId: string,
  request: Request,
) {
  const thesis = await getThesisById(tx, thesisId, userId);
  if (!thesis) return null;
  const [secSnapshot, byok] = await Promise.all([
    getSecSnapshot(tx, thesis.ticker),
    resolveEffectiveByok(tx, userId, request),
  ]);
  return { thesis, secSnapshot, byok };
}

function invalidCopilotRequest(error: Parameters<typeof formatZodError>[0], startedAt: number) {
  return jsonError(formatZodError(error, "投研副驾驶参数不合法。"), 400, startedAt, "INVALID");
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, COPILOT_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const quotaErr = await checkHostedAiQuota(auth.withDb, auth.user.id, request, startedAt);
  if (quotaErr) return quotaErr;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = CopilotRequestSchema.safeParse(body.data);
  if (!parsed.success) return invalidCopilotRequest(parsed.error, startedAt);
  const loaded = await auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(
      tx,
      parsed.data.thesisId,
      auth.user.id,
      "write",
      startedAt,
    );
    if (!guard.ok) return { ok: false as const, response: guard.response };
    const ctx = await loadCopilotInputsInTx(tx, parsed.data.thesisId, auth.user.id, request);
    if (!ctx) {
      return {
        ok: false as const,
        response: jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND"),
      };
    }
    return { ok: true as const, ...ctx };
  });
  if (!loaded.ok) return loaded.response;
  const result = await executeAndSaveCopilot({
    withDb: auth.withDb,
    userId: auth.user.id,
    action: parsed.data.action,
    sourceText: parsed.data.sourceText,
    thesis: loaded.thesis,
    secSnapshot: loaded.secSnapshot,
    byok: loaded.byok,
  });
  return jsonOk(result, startedAt);
}
