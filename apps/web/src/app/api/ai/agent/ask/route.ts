import {
  askResearchIc,
  hybridSearchChunks,
  planBilingualQuery,
  verifyGroundedClaims,
} from "@kanon/ai";
import { AgentAskRequestSchema, type ThesisDetail } from "@kanon/core";
import {
  getSecSnapshot,
  getThesisById,
  type KanonDb,
  listCachedSecFilingDocsByTicker,
  listResearchNotes,
  recordAiUsage,
  searchFilingChunksFts,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import {
  buildAiUsageEntry,
  checkHostedAiQuota,
  resolveEffectiveByok,
} from "../../../_lib/byok-headers";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../../_lib/request-guards";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

const ASK_IC_RATE_POLICY = { bucket: "ai_agent_ask", maxRequests: 25, windowMs: 60 * 1000 };

function verifyAskResult(
  thesis: ThesisDetail,
  answer: string,
  citations: readonly string[],
  evidenceTexts: ReadonlyMap<string, string>,
) {
  const chunkMap = new Map<string, string>();
  for (let i = 0; i < citations.length; i += 1) {
    const cit = citations[i];
    if (!cit) continue;
    chunkMap.set(`cit-${i}`, evidenceTexts.get(cit) ?? cit);
  }
  return verifyGroundedClaims({
    claims: [{ text: answer, citations: [...chunkMap.keys()] }],
    knownConceptFacts: [
      { concept: "price", value: thesis.currentPrice, kind: "scalar" },
      { concept: "target_price", value: thesis.valuation.bear.targetPrice, kind: "scalar" },
      { concept: "target_price", value: thesis.valuation.base.targetPrice, kind: "scalar" },
      { concept: "target_price", value: thesis.valuation.bull.targetPrice, kind: "scalar" },
    ],
    chunkMap,
  });
}

async function loadAskContextInTx(
  tx: KanonDb,
  params: { thesisId: string; userId: string; request: Request; tsQuery: string },
) {
  const thesis = await getThesisById(tx, params.thesisId, params.userId);
  if (!thesis) return null;
  const hasTerms = params.tsQuery.trim().length > 0;
  const [secSnapshot, cachedFilings, researchNotes, ftsRows, byok] = await Promise.all([
    getSecSnapshot(tx, thesis.ticker),
    listCachedSecFilingDocsByTicker(tx, thesis.ticker, 3),
    listResearchNotes(tx, thesis.id, 12),
    hasTerms
      ? searchFilingChunksFts(tx, {
          ticker: thesis.ticker,
          tsQuery: params.tsQuery,
          limit: 60,
        })
      : Promise.resolve([]),
    resolveEffectiveByok(tx, params.userId, params.request),
  ]);
  return {
    thesis,
    secSnapshot,
    cachedFilings,
    researchNotes,
    retrievalStatus: hasTerms ? ("fts" as const) : ("no_terms" as const),
    warehouseChunks: ftsRows.map((r) => ({
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
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>;
}) {
  const reranked = hybridSearchChunks({
    query: params.question,
    chunks: params.loaded.warehouseChunks,
    topK: 6,
  });
  const topChunks = reranked.map((r) => r.chunk);
  const result = await askResearchIc({
    thesis: params.loaded.thesis,
    secSnapshot: params.loaded.secSnapshot,
    question: params.question,
    cachedFilings: params.loaded.cachedFilings,
    warehouseChunks: topChunks.length > 0 ? topChunks : params.loaded.warehouseChunks,
    researchNotes: params.loaded.researchNotes,
    sourceText: params.sourceText,
    byok: params.loaded.byok,
  });
  const evidenceTexts = new Map(
    topChunks.map((c) => [`${c.accession} · ${c.sectionCode} · ¶${c.paraIndex + 1}`, c.text]),
  );
  const groundingReport = verifyAskResult(
    params.loaded.thesis,
    result.answer,
    result.citations,
    evidenceTexts,
  );
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
  const quotaErr = await checkHostedAiQuota(auth.withDb, auth.user.id, request, startedAt);
  if (quotaErr) return quotaErr;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = AgentAskRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "质询参数不合法。"), 400, startedAt, "INVALID");
  }
  const plan = planBilingualQuery(parsed.data.question);
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
      tsQuery: plan.tsQuery,
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
  const payload = await runAskAndMeter({
    loaded: loaded.ctx,
    userId: auth.user.id,
    question: parsed.data.question,
    sourceText: parsed.data.sourceText,
    withDb: auth.withDb,
  });
  return jsonOk(payload, startedAt);
}
