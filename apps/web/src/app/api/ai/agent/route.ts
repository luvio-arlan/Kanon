import {
  AgentRequestSchema,
  type ByokCredentials,
  fetchMarketQuote,
  streamResearchAgent,
} from "@kanon/ai";
import {
  AgentRunsListResponseSchema,
  type MarketQuoteSnapshot,
  type SecFilingReaderResponse,
} from "@kanon/core";
import {
  getKanonDb,
  getSecSnapshot,
  getThesisById,
  listAgentRuns,
  listCachedSecFilingDocsByTicker,
  listQuarterlyReviews,
  listThesisRevisions,
  saveAgentRun,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { parseByokHeaders } from "../../_lib/byok-headers";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { parseMarketHeaders } from "../../_lib/market-headers";
import { checkPersistentRateLimit, verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const AGENT_RATE_POLICY = { bucket: "ai_agent", maxRequests: 15, windowMs: 60 * 1000 };

function createAgentSseStream(params: {
  db: Awaited<ReturnType<typeof getKanonDb>>;
  thesis: NonNullable<Awaited<ReturnType<typeof getThesisById>>>;
  secSnapshot: Awaited<ReturnType<typeof getSecSnapshot>>;
  reviews: Awaited<ReturnType<typeof listQuarterlyReviews>>;
  revisions: Awaited<ReturnType<typeof listThesisRevisions>>;
  marketQuote: MarketQuoteSnapshot | null;
  cachedFilings: SecFilingReaderResponse[];
  sourceText?: string;
  byok: ByokCredentials | undefined;
}) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamResearchAgent(params)) {
          const payload =
            event.type === "briefing_ready"
              ? {
                  ...event,
                  runId: (
                    await saveAgentRun(params.db, {
                      thesisId: params.thesis.id,
                      engine: event.briefing.engine,
                      fallbackReason: event.briefing.fallbackReason ?? null,
                      briefing: event.briefing,
                    })
                  ).id,
                }
              : event;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message.slice(0, 80) : "未知异常";
        const errEvt = { type: "error", message: `投研 Agent 执行异常（${reason}），请重试。` };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errEvt)}\n\n`));
      } finally {
        controller.close();
      }
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
  const thesis = await getThesisById(db, thesisId, auth.user.id);
  if (!thesis) {
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
  if (!thesis) {
    return jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND");
  }
  const [secSnapshot, reviews, revisions, cachedFilings, quoteRes] = await Promise.all([
    getSecSnapshot(db, thesis.ticker),
    listQuarterlyReviews(db, thesis.id),
    listThesisRevisions(db, thesis.id),
    listCachedSecFilingDocsByTicker(db, thesis.ticker, 3),
    fetchMarketQuote(thesis.ticker, { creds: parseMarketHeaders(request) }),
  ]);
  const stream = createAgentSseStream({
    db,
    thesis,
    secSnapshot,
    reviews,
    revisions,
    cachedFilings,
    sourceText: parsed.data.sourceText,
    marketQuote: quoteRes.ok ? quoteRes.quote : null,
    byok: parseByokHeaders(request),
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
