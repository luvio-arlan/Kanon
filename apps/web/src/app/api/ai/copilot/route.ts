import {
  type ByokCredentials,
  ByokProviderSchema,
  CopilotRequestSchema,
  runThesisCopilot,
} from "@kanon/ai";
import { getKanonDb, getSecSnapshot, getThesisById, upsertCopilotOutput } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";

export const dynamic = "force-dynamic";

function parseByokHeaders(request: Request): ByokCredentials | undefined {
  const rawProvider = request.headers.get("x-kanon-ai-provider");
  const apiKey = request.headers.get("x-kanon-ai-key")?.trim();
  if (!rawProvider || !apiKey) return undefined;
  const parsed = ByokProviderSchema.safeParse(rawProvider);
  if (!parsed.success) return undefined;
  return { provider: parsed.data, apiKey };
}

export async function POST(request: Request) {
  const startedAt = performance.now();
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
