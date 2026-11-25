import { askResearchIc } from "@kanon/ai";
import { AgentAskRequestSchema } from "@kanon/core";
import {
  getKanonDb,
  getSecSnapshot,
  getThesisById,
  listCachedSecFilingDocsByTicker,
  listResearchNotes,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { parseByokHeaders } from "../../../_lib/byok-headers";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../../_lib/request-guards";

export const dynamic = "force-dynamic";

const ASK_IC_RATE_POLICY = { bucket: "ai_agent_ask", maxRequests: 25, windowMs: 60 * 1000 };

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, ASK_IC_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = AgentAskRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "质询参数不合法。"), 400, startedAt, "INVALID");
  }

  const db = await getKanonDb();
  const thesis = await getThesisById(db, parsed.data.thesisId, auth.user.id);
  if (!thesis) {
    return jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND");
  }

  const [secSnapshot, cachedFilings, researchNotes] = await Promise.all([
    getSecSnapshot(db, thesis.ticker),
    listCachedSecFilingDocsByTicker(db, thesis.ticker, 3),
    listResearchNotes(db, thesis.id, auth.user.id, 12),
  ]);
  const result = await askResearchIc({
    thesis,
    secSnapshot,
    question: parsed.data.question,
    cachedFilings,
    researchNotes,
    sourceText: parsed.data.sourceText,
    byok: parseByokHeaders(request),
  });
  return jsonOk(result, startedAt);
}
