import { CreateResearchNoteSchema, UpdateResearchNoteSchema } from "@kanon/core";
import {
  createResearchNote,
  deleteResearchNote,
  getKanonDb,
  listResearchNotes,
  updateResearchNote,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const db = await getKanonDb();
  const guard = await requireThesisAccess(db, id, auth.user.id, "read", startedAt);
  if (!guard.ok) return guard.response;
  const notes = await listResearchNotes(db, id);
  return jsonOk({ notes }, startedAt);
}

export async function POST(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = CreateResearchNoteSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "资料参数不合法。"), 400, startedAt, "INVALID");
  }
  const db = await getKanonDb();
  const guard = await requireThesisAccess(db, id, auth.user.id, "write", startedAt);
  if (!guard.ok) return guard.response;
  const note = await createResearchNote(db, {
    thesisId: id,
    userId: auth.user.id,
    input: parsed.data,
  });
  return jsonOk({ note }, startedAt, 201);
}

export async function PATCH(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = UpdateResearchNoteSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "资料更新参数不合法。"),
      400,
      startedAt,
      "INVALID",
    );
  }
  const db = await getKanonDb();
  const guard = await requireThesisAccess(db, id, auth.user.id, "write", startedAt);
  if (!guard.ok) return guard.response;
  const note = await updateResearchNote(db, {
    thesisId: id,
    userId: auth.user.id,
    input: parsed.data,
  });
  if (!note) return jsonError("未找到对应资料记录。", 404, startedAt, "NOT_FOUND");
  return jsonOk({ note }, startedAt);
}

export async function DELETE(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const noteId = new URL(request.url).searchParams.get("noteId")?.trim();
  if (!noteId) return jsonError("请提供资料 ID。", 400, startedAt, "INVALID");
  const db = await getKanonDb();
  const guard = await requireThesisAccess(db, id, auth.user.id, "write", startedAt);
  if (!guard.ok) return guard.response;
  const ok = await deleteResearchNote(db, { thesisId: id, userId: auth.user.id, noteId });
  if (!ok) return jsonError("未找到对应资料记录。", 404, startedAt, "NOT_FOUND");
  return jsonOk({ ok: true }, startedAt);
}
