import { askResearchIc, verifyGroundedClaims } from "@kanon/ai";
import { AgentAskRequestSchema, type ThesisDetail } from "@kanon/core";
import {
  getKanonDb,
  getSecSnapshot,
  getThesisById,
  listCachedSecFilingDocsByTicker,
  listResearchNotes,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { meterAiRouteUsage, resolveEffectiveByok } from "../../../_lib/byok-headers";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../../_lib/request-guards";

export const dynamic = "force-dynamic";

const ASK_IC_RATE_POLICY = { bucket: "ai_agent_ask", maxRequests: 25, windowMs: 60 * 1000 };

function verifyAskResult(thesis: ThesisDetail, answer: string, citations: readonly string[]) {
  const chunkMap = new Map(citations.map((c, idx) => [`cit-${idx}`, c]));
  return verifyGroundedClaims({
    claims: [{ text: answer, citations: [...chunkMap.keys()] }],
    knownFactValues: [
      thesis.currentPrice,
      thesis.valuation.bear.targetPrice,
      thesis.valuation.base.targetPrice,
      thesis.valuation.bull.targetPrice,
    ],
    chunkMap,
  });
}

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
  if (!thesis) return jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND");

  const [secSnapshot, cachedFilings, researchNotes, byok] = await Promise.all([
    getSecSnapshot(db, thesis.ticker),
    listCachedSecFilingDocsByTicker(db, thesis.ticker, 3),
    listResearchNotes(db, thesis.id, auth.user.id, 12),
    resolveEffectiveByok(db, auth.user.id, request),
  ]);
  const result = await askResearchIc({
    thesis,
    secSnapshot,
    question: parsed.data.question,
    cachedFilings,
    researchNotes,
    sourceText: parsed.data.sourceText,
    byok,
  });
  const groundingReport = verifyAskResult(thesis, result.answer, result.citations);
  await meterAiRouteUsage({
    db,
    userId: auth.user.id,
    thesisId: thesis.id,
    route: "/api/ai/agent/ask",
    engine: result.engine,
    byok,
  });
  return jsonOk({ ...result, groundingReport }, startedAt);
}
