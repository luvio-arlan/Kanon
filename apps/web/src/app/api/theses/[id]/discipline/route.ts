import { CreateDisciplineEntrySchema } from "@kanon/core";
import { addDisciplineEntry, getKanonDb } from "@kanon/core/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  const parsed = CreateDisciplineEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "纪律检查未通过。" },
      { status: 400 },
    );
  }

  const db = await getKanonDb();
  const thesis = await addDisciplineEntry(db, id, parsed.data);
  if (!thesis) {
    return NextResponse.json({ error: "未找到该研究标的。" }, { status: 404 });
  }
  return NextResponse.json({ thesis }, { status: 201 });
}
