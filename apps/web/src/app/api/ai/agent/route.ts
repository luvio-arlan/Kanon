import {
  AgentRequestSchema,
  type ByokCredentials,
  ByokProviderSchema,
  streamResearchAgent,
} from "@kanon/ai";
import {
  getKanonDb,
  getSecSnapshot,
  getThesisById,
  listQuarterlyReviews,
  listThesisRevisions,
  saveAgentRun,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, readJsonBody } from "../../_lib/http";

export const dynamic = "force-dynamic";

function parseByokHeaders(request: Request): ByokCredentials | undefined {
  const rawProvider = request.headers.get("x-kanon-ai-provider");
  const apiKey = request.headers.get("x-kanon-ai-key")?.trim();
  if (!rawProvider || !apiKey) return undefined;
  const parsed = ByokProviderSchema.safeParse(rawProvider);
  if (!parsed.success) return undefined;
  return { provider: parsed.data, apiKey };
}

function createAgentSseStream(params: {
  db: Awaited<ReturnType<typeof getKanonDb>>;
  thesis: NonNullable<Awaited<ReturnType<typeof getThesisById>>>;
  secSnapshot: Awaited<ReturnType<typeof getSecSnapshot>>;
  reviews: Awaited<ReturnType<typeof listQuarterlyReviews>>;
  revisions: Awaited<ReturnType<typeof listThesisRevisions>>;
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

export async function POST(request: Request) {
  const startedAt = performance.now();
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
  const [secSnapshot, reviews, revisions] = await Promise.all([
    getSecSnapshot(db, thesis.ticker),
    listQuarterlyReviews(db, thesis.id),
    listThesisRevisions(db, thesis.id),
  ]);
  const stream = createAgentSseStream({
    db,
    thesis,
    secSnapshot,
    reviews,
    revisions,
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
