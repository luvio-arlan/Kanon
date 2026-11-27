import { askResearchIc, expandBilingualFinanceQuery, verifyGroundedClaims } from "@kanon/ai";
import { AgentAskRequestSchema, type ThesisDetail } from "@kanon/core";
import {
  getKanonDb,
  getSecSnapshot,
  getThesisById,
  listCachedSecFilingDocsByTicker,
  listResearchNotes,
  searchFilingChunksLexical,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { meterAiRouteUsage, resolveEffectiveByok } from "../../../_lib/byok-headers";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../../_lib/request-guards";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

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

async function fetchWarehouseChunksForQuestion(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  ticker: string,
  question: string,
) {
  const terms = expandBilingualFinanceQuery(question).filter((t) => /^[a-z0-9-]+$/i.test(t));
  const keyword = terms[0] ?? ticker;
  const rows = await searchFilingChunksLexical(db, { ticker, keyword, limit: 24 });
  return rows.map((r) => ({
    id: r.id,
    accession: r.accession,
    sectionCode: r.sectionCode,
    paraIndex: r.paraIndex,
    text: r.text,
  }));
}

async function executeIcAsk(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  thesis: ThesisDetail,
  userId: string,
  request: Request,
  question: string,
  sourceText?: string,
) {
  const [secSnapshot, cachedFilings, researchNotes, warehouseChunks, byok] = await Promise.all([
    getSecSnapshot(db, thesis.ticker),
    listCachedSecFilingDocsByTicker(db, thesis.ticker, 3),
    listResearchNotes(db, thesis.id, 12),
    fetchWarehouseChunksForQuestion(db, thesis.ticker, question),
    resolveEffectiveByok(db, userId, request),
  ]);
  const result = await askResearchIc({
    thesis,
    secSnapshot,
    question,
    cachedFilings,
    warehouseChunks,
    researchNotes,
    sourceText,
    byok,
  });
  const groundingReport = verifyAskResult(thesis, result.answer, result.citations);
  await meterAiRouteUsage({
    db,
    userId,
    thesisId: thesis.id,
    route: "/api/ai/agent/ask",
    engine: result.engine,
    byok,
    usage: result.usage,
  });
  return { ...result, groundingReport };
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
  const guard = await requireThesisAccess(
    db,
    parsed.data.thesisId,
    auth.user.id,
    "read",
    startedAt,
  );
  if (!guard.ok) return guard.response;
  const thesis = await getThesisById(db, parsed.data.thesisId, auth.user.id);
  if (!thesis) return jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND");
  const payload = await executeIcAsk(
    db,
    thesis,
    auth.user.id,
    request,
    parsed.data.question,
    parsed.data.sourceText,
  );
  return jsonOk(payload, startedAt);
}
