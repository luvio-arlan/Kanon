import { AgentRequestSchema, streamResearchAgent } from "@kanon/ai";
import { AgentRunsListResponseSchema } from "@kanon/core";
import { getThesisById, listAgentRuns, recordAiUsage, saveAgentRun } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import {
  buildAiUsageEntry,
  checkHostedAiQuota,
  resolveEffectiveByok,
} from "../../_lib/byok-headers";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../_lib/request-guards";
import { requireThesisAccess } from "../../_lib/thesis-guard";
import { type AgentStreamParams, loadAgentEvidence } from "./agent-evidence";

export const dynamic = "force-dynamic";

const AGENT_RATE_POLICY = { bucket: "ai_agent", maxRequests: 15, windowMs: 60 * 1000 };
const AGENT_STREAM_TIMEOUT_MS = 55_000;

async function pumpAgentEvents(
  params: AgentStreamParams,
  signal: AbortSignal,
  enqueue: (chunk: string) => void,
) {
  enqueue(": connected\n\n");
  const evidence = await loadAgentEvidence(params);
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
      const usage = await buildAiUsageEntry({
        userId: params.userId,
        thesisId: params.thesis.id,
        route: "/api/ai/agent",
        engine: event.briefing.engine,
        byok: params.byok,
      });
      const saved = await params.withDb(async (tx) => {
        await recordAiUsage(tx, usage);
        return saveAgentRun(tx, {
          thesisId: params.thesis.id,
          engine: event.briefing.engine,
          fallbackReason: event.briefing.fallbackReason ?? null,
          briefing: event.briefing,
        });
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
  if (!thesisId) return jsonError("请提供研究标的 ID。", 400, startedAt, "INVALID");
  const outcome = await auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(tx, thesisId, auth.user.id, "read", startedAt);
    if (!guard.ok) return guard;
    return { ok: true as const, runs: await listAgentRuns(tx, thesisId, 5) };
  });
  if (!outcome.ok) return outcome.response;
  return jsonOk(AgentRunsListResponseSchema.parse({ runs: outcome.runs }), startedAt);
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, AGENT_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const quotaErr = await checkHostedAiQuota(auth.withDb, auth.user.id, request, startedAt);
  if (quotaErr) return quotaErr;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = AgentRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "Agent 参数不合法。"), 400, startedAt, "INVALID");
  }
  const init = await auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(
      tx,
      parsed.data.thesisId,
      auth.user.id,
      "write",
      startedAt,
    );
    if (!guard.ok) return { ok: false as const, response: guard.response };
    const thesis = await getThesisById(tx, parsed.data.thesisId, auth.user.id);
    if (!thesis) {
      return {
        ok: false as const,
        response: jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND"),
      };
    }
    return {
      ok: true as const,
      thesis,
      byok: await resolveEffectiveByok(tx, auth.user.id, request),
    };
  });
  if (!init.ok) return init.response;
  const stream = createAgentSseStream({
    withDb: auth.withDb,
    thesis: init.thesis,
    userId: auth.user.id,
    request,
    sourceText: parsed.data.sourceText,
    byok: init.byok,
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
