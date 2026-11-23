import { CopilotRequestSchema, runThesisCopilot } from "@kanon/ai";
import { getKanonDb, getSecSnapshot, getThesisById } from "@kanon/core/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  const parsed = CopilotRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "AI 副驾驶参数不合法。" }, { status: 400 });
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
  });
  return NextResponse.json(result);
}
