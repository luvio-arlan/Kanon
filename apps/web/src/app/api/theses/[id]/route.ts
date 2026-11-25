import { UpdateThesisStepSchema } from "@kanon/core";
import {
  deleteThesis,
  getKanonDb,
  getSecSnapshot,
  getThesisById,
  listThesisRevisions,
  updateThesisStep,
} from "@kanon/core/db";
import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { apiHeaders, formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
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
    getSecSnapshot(db, thesis.ticker),
    listThesisRevisions(db, id),
  ]);
  return jsonOk({ thesis, secSnapshot, revisions }, startedAt);
}

function extractExpectedUpdatedAt(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const val = (raw as { expectedUpdatedAt?: unknown }).expectedUpdatedAt;
  return typeof val === "string" && val.length > 0 ? val : null;
}

async function verifyExpectedUpdatedAt(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  id: string,
  userId: string,
  rawBody: unknown,
  startedAt: number,
): Promise<NextResponse | null> {
  const expected = extractExpectedUpdatedAt(rawBody);
  if (!expected) return null;
  const existing = await getThesisById(db, id, userId);
  if (!existing) return jsonError("标的档案不存在。", 404, startedAt, "NOT_FOUND");
  const diffMs = Math.abs(new Date(existing.updatedAt).getTime() - new Date(expected).getTime());
  if (!Number.isFinite(diffMs) || diffMs <= 1000) return null;
  return NextResponse.json(
    {
      error: "该档案已在其他标签页更新，请同步最新版本。",
      code: "CONFLICT",
      serverUpdatedAt: existing.updatedAt,
    },
    { status: 409, headers: apiHeaders(startedAt) },
  );
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
  const conflictErr = await verifyExpectedUpdatedAt(db, id, auth.user.id, body.data, startedAt);
  if (conflictErr) return conflictErr;

  const updated = await updateThesisStep(db, id, parsed.data, auth.user.id);
  if (!updated) {
    return jsonError("标的档案不存在。", 404, startedAt, "NOT_FOUND");
  }
  const revisions = await listThesisRevisions(db, id);
  return jsonOk({ thesis: updated, revisions }, startedAt);
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
