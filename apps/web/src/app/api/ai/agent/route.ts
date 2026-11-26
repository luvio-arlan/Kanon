import {
  AgentRequestSchema,
  type ByokCredentials,
  buildMarketBenchmarks,
  fetchMarketQuote,
  streamResearchAgent,
} from "@kanon/ai";
import { AgentRunsListResponseSchema } from "@kanon/core";
import {
  assertThesisOwnership,
  getKanonDb,
  getSecSnapshot,
  getSecSnapshotForUser,
  getThesisById,
  listAgentRuns,
  listCachedSecFilingDocsByTicker,
  listQuarterlyReviews,
  listResearchNotes,
  listThesisRevisions,
  saveAgentRun,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { resolveEffectiveByok } from "../../_lib/byok-headers";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { parseMarketHeaders } from "../../_lib/market-headers";
import { checkPersistentRateLimit, verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const AGENT_RATE_POLICY = { bucket: "ai_agent", maxRequests: 15, windowMs: 60 * 1000 };
const AGENT_STREAM_TIMEOUT_MS = 55_000;

async function loadAgentEvidence(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  thesis: NonNullable<Awaited<ReturnType<typeof getThesisById>>>,
  userId: string,
  request: Request,
) {
  const marketCreds = parseMarketHeaders(request);
  const [secSnapshot, reviews, revisions, cachedFilings, researchNotes, quoteRes] =
    await Promise.all([
      getSecSnapshotForUser(db, thesis.ticker, userId),
      listQuarterlyReviews(db, thesis.id),
      listThesisRevisions(db, thesis.id),
      listCachedSecFilingDocsByTicker(db, thesis.ticker, 3),
      listResearchNotes(db, thesis.id, userId, 12),
      fetchMarketQuote(thesis.ticker, { creds: marketCreds }),
    ]);
  const marketQuote = quoteRes.ok ? quoteRes.quote : null;
  const benchmarks = await buildMarketBenchmarks({
    ticker: thesis.ticker,
    currentPrice: marketQuote?.effectivePrice ?? thesis.currentPrice,
    secSnapshot,
    loadCachedPeers: async (peerTickers) => {
      const snaps = await Promise.all(peerTickers.map((pt) => getSecSnapshot(db, pt)));
      const map = new Map<string, NonNullable<(typeof snaps)[number]>>();
      for (const s of snaps) if (s) map.set(s.ticker.toUpperCase(), s);
      return map;
    },
    creds: marketCreds,
  }).catch(() => null);
  return { secSnapshot, reviews, revisions, cachedFilings, researchNotes, marketQuote, benchmarks };
}

interface AgentStreamParams {
  db: Awaited<ReturnType<typeof getKanonDb>>;
  thesis: NonNullable<Awaited<ReturnType<typeof getThesisById>>>;
  userId: string;
  request: Request;
  sourceText?: string;
  byok: ByokCredentials | undefined;
}

async function pumpAgentEvents(
  params: AgentStreamParams,
  signal: AbortSignal,
  enqueue: (chunk: string) => void,
) {
  enqueue(": connected\n\n");
  const evidence = await loadAgentEvidence(params.db, params.thesis, params.userId, params.request);
  if (signal.aborted) return;
  for await (const event of streamResearchAgent({
    thesis: params.thesis,
    ...evidence,
    sourceText: params.sourceText,
    byok: params.byok,
    abortSignal: signal,
  })) {
    if (signal.aborted) break;
    if (event.type === "briefing_ready") {
      const saved = await saveAgentRun(params.db, {
        thesisId: params.thesis.id,
        engine: event.briefing.engine,
        fallbackReason: event.briefing.fallbackReason ?? null,
        briefing: event.briefing,
      });
      enqueue(`data: ${JSON.stringify({ ...event, runId: saved.id })}\n\n`);
      continue;
    }
    enqueue(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function closeControllerSafely(controller: ReadableStreamDefaultController<Uint8Array>) {
  try {
    controller.close();
  } catch (closeErr) {
    void closeErr;
  }
}

function createAgentSseStream(params: AgentStreamParams) {
  const encoder = new TextEncoder();
  const streamAbort = new AbortController();
  let closed = false;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  const onReqAbort = () => streamAbort.abort();
  params.request.signal.addEventListener("abort", onReqAbort, { once: true });
  const cleanup = () => {
    closed = true;
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    params.request.signal.removeEventListener("abort", onReqAbort);
  };
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (chunk: string) => {
        if (closed || streamAbort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch (err) {
          void err;
          closed = true;
        }
      };
      pingTimer = setInterval(() => enqueue(": ping\n\n"), 10_000);
      const signal = AbortSignal.any([
        streamAbort.signal,
        AbortSignal.timeout(AGENT_STREAM_TIMEOUT_MS),
      ]);
      try {
        await pumpAgentEvents(params, signal, enqueue);
      } catch (err) {
        void err;
        enqueue(
          `data: ${JSON.stringify({ type: "error", message: "投研 Agent 执行超时或异常，请稍后重试。" })}\n\n`,
        );
      } finally {
        const alreadyClosed = closed;
        cleanup();
        if (!alreadyClosed) closeControllerSafely(controller);
      }
    },
    cancel() {
      streamAbort.abort();
      cleanup();
    },
  });
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const thesisId = new URL(request.url).searchParams.get("thesisId")?.trim();
  if (!thesisId) {
    return jsonError("请提供研究标的 ID。", 400, startedAt, "INVALID");
  }
  const db = await getKanonDb();
  if (!(await assertThesisOwnership(db, thesisId, auth.user.id))) {
    return jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND");
  }
  const runs = await listAgentRuns(db, thesisId, 5);
  return jsonOk(AgentRunsListResponseSchema.parse({ runs }), startedAt);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, AGENT_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = AgentRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "Agent 参数不合法。"), 400, startedAt, "INVALID");
  }

  const db = await getKanonDb();
  const thesis = await getThesisById(db, parsed.data.thesisId, auth.user.id);
  if (!thesis) return jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND");

  const byok = await resolveEffectiveByok(db, auth.user.id, request);
  const stream = createAgentSseStream({
    db,
    thesis,
    userId: auth.user.id,
    request,
    sourceText: parsed.data.sourceText,
    byok,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
