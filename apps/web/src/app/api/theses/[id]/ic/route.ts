import { IcDecisionRequestSchema, IcPostRequestSchema } from "@kanon/core";
import {
  addThesisComment,
  assertThesisOwnership,
  decideIcApproval,
  getKanonDb,
  IcApprovalError,
  listIcApprovals,
  listThesisComments,
  submitIcApproval,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = await getKanonDb();
  if (!(await assertThesisOwnership(db, id, auth.user.id))) {
    return jsonError("标的研究不存在或无访问权限。", 404, startedAt, "NOT_FOUND");
  }
  const [approvals, comments] = await Promise.all([
    listIcApprovals(db, id),
    listThesisComments(db, id),
  ]);
  return jsonOk({ approvals, comments }, startedAt);
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = await getKanonDb();
  if (!(await assertThesisOwnership(db, id, auth.user.id))) {
    return jsonError("标的研究不存在或无访问权限。", 404, startedAt, "NOT_FOUND");
  }
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = IcPostRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "无效请求体。"), 400, startedAt, "INVALID");
  }
  if (parsed.data.op === "comment") {
    const commentId = await addThesisComment(db, {
      thesisId: id,
      userId: auth.user.id,
      anchorType: parsed.data.anchorType,
      anchorId: parsed.data.anchorId ?? null,
      body: parsed.data.body,
    });
    return jsonOk({ commentId }, startedAt, 201);
  }
  try {
    const approval = await submitIcApproval(db, {
      thesisId: id,
      submittedBy: auth.user.id,
      note: parsed.data.note,
    });
    return jsonOk({ approval }, startedAt, 201);
  } catch (err) {
    if (err instanceof IcApprovalError) {
      return jsonError(err.message, err.status, startedAt, err.code);
    }
    return jsonError("提交审批失败。", 500, startedAt, "IC_SUBMIT_FAILED");
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = await getKanonDb();
  if (!(await assertThesisOwnership(db, id, auth.user.id))) {
    return jsonError("标的研究不存在或无访问权限。", 404, startedAt, "NOT_FOUND");
  }
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = IcDecisionRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "请提供有效审批 ID 与决议状态。"),
      400,
      startedAt,
      "INVALID_DECISION",
    );
  }
  try {
    const result = await decideIcApproval(db, {
      thesisId: id,
      approvalId: parsed.data.approvalId,
      decidedBy: auth.user.id,
      decision: parsed.data.decision,
      decisionNote: parsed.data.decisionNote,
    });
    return jsonOk({ approval: result }, startedAt);
  } catch (err) {
    if (err instanceof IcApprovalError) {
      return jsonError(err.message, err.status, startedAt, err.code);
    }
    return jsonError(
      err instanceof Error ? err.message : "审批失败。",
      403,
      startedAt,
      "FORBIDDEN",
    );
  }
}
