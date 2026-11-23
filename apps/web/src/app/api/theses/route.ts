import { CreateThesisInputSchema } from "@kanon/core";
import { createThesis, getKanonDb, listGlossaryTerms, listTheses } from "@kanon/core/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getKanonDb();
  const [theses, glossary] = await Promise.all([listTheses(db), listGlossaryTerms(db)]);
  return NextResponse.json({ theses, glossary });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  const parsed = CreateThesisInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "标的参数校验失败。" },
      { status: 400 },
    );
  }

  try {
    const db = await getKanonDb();
    const thesis = await createThesis(db, parsed.data);
    return NextResponse.json({ thesis }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.toLowerCase().includes("unique")) {
      return NextResponse.json(
        { error: `标的 ${parsed.data.ticker} 已在跟踪列表中，请直接进入原画布编辑。` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "创建标的失败，请检查输入后重试。" }, { status: 500 });
  }
}
