import { UpdateThesisStepSchema } from "@kanon/core";
import {
  deleteThesis,
  getKanonDb,
  getSecSnapshot,
  getThesisById,
  listThesisRevisions,
  updateThesisStep,
} from "@kanon/core/db";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const { id } = await context.params;
  const db = await getKanonDb();
  const thesis = await getThesisById(db, id);
  if (!thesis) {
    return jsonError("未找到该研究标的。", 404, startedAt, "NOT_FOUND");
  }
  const [secSnapshot, revisions] = await Promise.all([
    getSecSnapshot(db, thesis.ticker),
    listThesisRevisions(db, id),
  ]);
  return jsonOk({ thesis, secSnapshot, revisions }, startedAt);
}

export async function PATCH(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const { id } = await context.params;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = UpdateThesisStepSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "更新参数校验失败。"), 400, startedAt, "INVALID");
  }

  const db = await getKanonDb();
  const updated = await updateThesisStep(db, id, parsed.data);
  if (!updated) {
    return jsonError("标的档案不存在。", 404, startedAt, "NOT_FOUND");
  }
  const revisions = await listThesisRevisions(db, id);
  return jsonOk({ thesis: updated, revisions }, startedAt);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const { id } = await context.params;
  const db = await getKanonDb();
  const deleted = await deleteThesis(db, id);
  if (!deleted) {
    return jsonError("标的档案不存在。", 404, startedAt, "NOT_FOUND");
  }
  return jsonOk({ ok: true }, startedAt);
}
