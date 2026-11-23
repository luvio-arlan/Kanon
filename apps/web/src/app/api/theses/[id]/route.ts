import { UpdateThesisStepSchema } from "@kanon/core";
import {
  deleteThesis,
  getKanonDb,
  getSecSnapshot,
  getThesisById,
  updateThesisStep,
} from "@kanon/core/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const db = await getKanonDb();
  const thesis = await getThesisById(db, id);
  if (!thesis) {
    return NextResponse.json({ error: "未找到该研究标的。" }, { status: 404 });
  }
  const secSnapshot = await getSecSnapshot(db, thesis.ticker);
  return NextResponse.json({ thesis, secSnapshot });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  const parsed = UpdateThesisStepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "更新参数校验失败。" },
      { status: 400 },
    );
  }

  const db = await getKanonDb();
  const updated = await updateThesisStep(db, id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "标的档案不存在。" }, { status: 404 });
  }
  return NextResponse.json({ thesis: updated });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const db = await getKanonDb();
  const deleted = await deleteThesis(db, id);
  if (!deleted) {
    return NextResponse.json({ error: "标的档案不存在。" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
