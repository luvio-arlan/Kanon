import { askResearchIc, expandBilingualFinanceQuery, verifyGroundedClaims } from "@kanon/ai";
import { AgentAskRequestSchema, type ThesisDetail } from "@kanon/core";
import {
  getSecSnapshot,
  getThesisById,
  listCachedSecFilingDocsByTicker,
  listResearchNotes,
  recordAiUsage,
  searchFilingChunksLexical,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { buildAiUsageEntry, resolveEffectiveByok } from "../../../_lib/byok-headers";
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

function extractAsciiSearchKeyword(question: string): string | null {
  const terms = expandBilingualFinanceQuery(question).filter((t) => /^[a-z0-9-]+$/i.test(t));
  return terms[0] ?? null;
}

async function loadAskContextInTx(
  tx: import("@kanon/core/db").KanonDb,
  params: { thesisId: string; userId: string; request: Request; expandedKeyword: string | null },
) {
  const thesis = await getThesisById(tx, params.thesisId, params.userId);
  if (!thesis) return null;
  const [secSnapshot, cachedFilings, researchNotes, chunkRows, byok] = await Promise.all([
    getSecSnapshot(tx, thesis.ticker),
    listCachedSecFilingDocsByTicker(tx, thesis.ticker, 3),
    listResearchNotes(tx, thesis.id, 12),
    searchFilingChunksLexical(tx, {
      ticker: thesis.ticker,
      keyword: params.expandedKeyword ?? thesis.ticker,
      limit: 24,
    }),
    resolveEffectiveByok(tx, params.userId, params.request),
  ]);
  return {
    thesis,
    secSnapshot,
    cachedFilings,
    researchNotes,
    warehouseChunks: chunkRows.map((r) => ({
      id: r.id,
      accession: r.accession,
      sectionCode: r.sectionCode,
      paraIndex: r.paraIndex,
      text: r.text,
    })),
    byok,
  };
}

async function runAskAndMeter(params: {
  loaded: NonNullable<Awaited<ReturnType<typeof loadAskContextInTx>>>;
  userId: string;
  question: string;
  sourceText?: string;
  withDb: <T>(fn: (tx: import("@kanon/core/db").KanonDb) => Promise<T>) => Promise<T>;
}) {
  const result = await askResearchIc({
    thesis: params.loaded.thesis,
    secSnapshot: params.loaded.secSnapshot,
    question: params.question,
    cachedFilings: params.loaded.cachedFilings,
    warehouseChunks: params.loaded.warehouseChunks,
    researchNotes: params.loaded.researchNotes,
    sourceText: params.sourceText,
    byok: params.loaded.byok,
  });
  const groundingReport = verifyAskResult(params.loaded.thesis, result.answer, result.citations);
  const usageEntry = await buildAiUsageEntry({
    userId: params.userId,
    thesisId: params.loaded.thesis.id,
    route: "/api/ai/agent/ask",
    engine: result.engine,
    byok: params.loaded.byok,
    usage: result.usage,
  });
  await params.withDb((tx) => recordAiUsage(tx, usageEntry)).catch(() => undefined);
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
  const expandedKeyword = extractAsciiSearchKeyword(parsed.data.question);
  const loaded = await auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(
      tx,
      parsed.data.thesisId,
      auth.user.id,
      "comment",
      startedAt,
    );
    if (!guard.ok) return { ok: false as const, response: guard.response };
    const ctx = await loadAskContextInTx(tx, {
      thesisId: parsed.data.thesisId,
      userId: auth.user.id,
      request,
      expandedKeyword,
    });
    if (!ctx) {
      return {
        ok: false as const,
        response: jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND"),
      };
    }
    return { ok: true as const, ctx };
  });
  if (!loaded.ok) return loaded.response;
  const { question, sourceText } = parsed.data;
  const payload = await runAskAndMeter({
    loaded: loaded.ctx,
    userId: auth.user.id,
    question,
    sourceText,
    withDb: auth.withDb,
  });
  return jsonOk(payload, startedAt);
}
