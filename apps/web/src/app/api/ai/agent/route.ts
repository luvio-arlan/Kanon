import { AgentRequestSchema, streamResearchAgent } from "@kanon/ai";
import { getKanonDb, getSecSnapshot, getThesisById } from "@kanon/core/db";
import { formatZodError, jsonError, readJsonBody } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = AgentRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "Agent 参数不合法。"), 400, startedAt, "INVALID");
  }

  const db = await getKanonDb();
  const thesis = await getThesisById(db, parsed.data.thesisId);
  if (!thesis) {
    return jsonError("未找到对应标的档案。", 404, startedAt, "NOT_FOUND");
  }
  const secSnapshot = await getSecSnapshot(db, thesis.ticker);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamResearchAgent({ thesis, secSnapshot })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch {
        const errEvt = { type: "error", message: "投研 Agent 执行异常，请重试。" };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errEvt)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
