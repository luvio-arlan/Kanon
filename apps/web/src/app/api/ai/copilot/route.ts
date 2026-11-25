import { CopilotRequestSchema, runThesisCopilot } from "@kanon/ai";
import { getKanonDb, getSecSnapshot, getThesisById, upsertCopilotOutput } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { parseByokHeaders } from "../../_lib/byok-headers";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { checkRateLimit, verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const COPILOT_RATE_POLICY = { bucket: "ai_copilot", maxRequests: 20, windowMs: 60 * 1000 };

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = checkRateLimit(request, COPILOT_RATE_POLICY, startedAt);
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
  const thesis = await getThesisById(db, parsed.data.thesisId, auth.user.id);
  if (!thesis) {
    return jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND");
  }

  const secSnapshot = await getSecSnapshot(db, thesis.ticker);
  const result = await runThesisCopilot({
    action: parsed.data.action,
    thesis,
    secSnapshot,
    sourceText: parsed.data.sourceText,
    byok: parseByokHeaders(request),
  });

  await upsertCopilotOutput(db, thesis.id, {
    action: result.action,
    engine: result.engine,
    payload: result.data,
  });

  return jsonOk(result, startedAt);
}
