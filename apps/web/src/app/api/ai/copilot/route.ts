import { CopilotRequestSchema, runThesisCopilot } from "@kanon/ai";
import { getKanonDb, getSecSnapshot, getThesisById, upsertCopilotOutput } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { meterAiRouteUsage, resolveEffectiveByok } from "../../_lib/byok-headers";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../_lib/request-guards";
import { requireThesisAccess } from "../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

const COPILOT_RATE_POLICY = { bucket: "ai_copilot", maxRequests: 20, windowMs: 60 * 1000 };

async function runAndPersistCopilot(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  userId: string,
  request: Request,
  input: {
    thesisId: string;
    action: "earnings_digest" | "red_team" | "investment_memo";
    sourceText?: string;
  },
) {
  const thesis = await getThesisById(db, input.thesisId, userId);
  if (!thesis) return null;
  const [secSnapshot, byok] = await Promise.all([
    getSecSnapshot(db, thesis.ticker),
    resolveEffectiveByok(db, userId, request),
  ]);
  const result = await runThesisCopilot({
    action: input.action,
    thesis,
    secSnapshot,
    sourceText: input.sourceText,
    byok,
  });
  await Promise.all([
    upsertCopilotOutput(db, thesis.id, {
      action: result.action,
      engine: result.engine,
      payload: result.data,
    }),
    meterAiRouteUsage({
      db,
      userId,
      thesisId: thesis.id,
      route: "/api/ai/copilot",
      engine: result.engine,
      byok,
      usage: result.usage,
    }),
  ]);
  return result;
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, COPILOT_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = CopilotRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "投研副驾驶参数不合法。"),
      400,
      startedAt,
      "INVALID",
    );
  }
  const db = await getKanonDb();
  const guard = await requireThesisAccess(
    db,
    parsed.data.thesisId,
    auth.user.id,
    "write",
    startedAt,
  );
  if (!guard.ok) return guard.response;
  const result = await runAndPersistCopilot(db, auth.user.id, request, parsed.data);
  if (!result) return jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND");
  return jsonOk(result, startedAt);
}
