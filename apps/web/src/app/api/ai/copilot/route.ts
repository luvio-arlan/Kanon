import {
  type ByokCredentials,
  ByokProviderSchema,
  CopilotRequestSchema,
  runThesisCopilot,
} from "@kanon/ai";
import { getKanonDb, getSecSnapshot, getThesisById, upsertCopilotOutput } from "@kanon/core/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseByokHeaders(request: Request): ByokCredentials | undefined {
  const rawProvider = request.headers.get("x-kanon-ai-provider");
  const apiKey = request.headers.get("x-kanon-ai-key")?.trim();
  if (!rawProvider || !apiKey) return undefined;
  const parsed = ByokProviderSchema.safeParse(rawProvider);
  if (!parsed.success) return undefined;
  return { provider: parsed.data, apiKey };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  const parsed = CopilotRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "投研副驾驶参数不合法。" }, { status: 400 });
  }

  const db = await getKanonDb();
  const thesis = await getThesisById(db, parsed.data.thesisId);
  if (!thesis) {
    return NextResponse.json({ error: "未找到对应标的档案。" }, { status: 404 });
  }

  const secSnapshot = await getSecSnapshot(db, thesis.ticker);
  const result = await runThesisCopilot({
    action: parsed.data.action,
    thesis,
    secSnapshot,
    sourceText: parsed.data.sourceText,
    byok: parseByokHeaders(request),
  });

  await upsertCopilotOutput(db, thesis.id, {
    action: result.action,
    engine: result.engine,
    payload: result.data,
  });

  return NextResponse.json(result);
}
