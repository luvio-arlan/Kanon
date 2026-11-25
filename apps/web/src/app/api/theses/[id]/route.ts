import { UpdateThesisStepSchema } from "@kanon/core";
import {
  deleteThesis,
  getKanonDb,
  getSecSnapshotForUser,
  getThesisById,
  listThesisRevisions,
  updateThesisStepChecked,
} from "@kanon/core/db";
import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import {
  apiHeaders,
  formatZodError,
  isUniqueConstraintError,
  jsonError,
  jsonOk,
  readJsonBody,
} from "../../_lib/http";
import { verifySameOrigin } from "../../_lib/request-guards";

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
  const thesis = await getThesisById(db, id, auth.user.id);
  if (!thesis) {
    return jsonError("未找到该研究标的。", 404, startedAt, "NOT_FOUND");
  }
  const [secSnapshot, revisions] = await Promise.all([
    getSecSnapshotForUser(db, thesis.ticker, auth.user.id),
    listThesisRevisions(db, id),
  ]);
  return jsonOk({ thesis, secSnapshot, revisions }, startedAt);
}

function extractExpectedUpdatedAt(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const val = (raw as { expectedUpdatedAt?: unknown }).expectedUpdatedAt;
  return typeof val === "string" && val.length > 0 ? val : null;
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

  const parsed = UpdateThesisStepSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "更新参数校验失败。"), 400, startedAt, "INVALID");
  }

  const db = await getKanonDb();
  let result: Awaited<ReturnType<typeof updateThesisStepChecked>>;
  try {
    result = await updateThesisStepChecked(
      db,
      id,
      parsed.data,
      auth.user.id,
      extractExpectedUpdatedAt(body.data),
    );
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return jsonError("记录标识冲突，请刷新后重试。", 409, startedAt, "CONFLICT");
    }
    throw err;
  }
  if (result.kind === "not_found") {
    return jsonError("标的档案不存在。", 404, startedAt, "NOT_FOUND");
  }
  if (result.kind === "invalid_version") {
    return jsonError("无效的版本时间戳。", 400, startedAt, "INVALID_VERSION");
  }
  if (result.kind === "conflict") {
    return NextResponse.json(
      {
        error: "该档案已在其他标签页更新，请同步最新版本。",
        code: "CONFLICT",
        serverUpdatedAt: result.serverUpdatedAt,
      },
      { status: 409, headers: apiHeaders(startedAt) },
    );
  }
  return jsonOk({ thesis: result.thesis, revisions: result.revisions }, startedAt);
}

export async function DELETE(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const db = await getKanonDb();
  const deleted = await deleteThesis(db, id, auth.user.id);
  if (!deleted) {
    return jsonError("标的档案不存在。", 404, startedAt, "NOT_FOUND");
  }
  return jsonOk({ ok: true }, startedAt);
}
