import { IcDecisionRequestSchema, IcPostRequestSchema } from "@kanon/core";
import {
  addThesisComment,
  decideIcApproval,
  IcApprovalError,
  listIcApprovals,
  listThesisComments,
  submitIcApproval,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  return auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(tx, id, auth.user.id, "read", startedAt);
    if (!guard.ok) return guard.response;
    const [approvals, comments] = await Promise.all([
      listIcApprovals(tx, id),
      listThesisComments(tx, id),
    ]);
    return jsonOk({ approvals, comments }, startedAt);
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = IcPostRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "无效请求体。"), 400, startedAt, "INVALID");
  }
  if (parsed.data.op === "comment") {
    const commentData = parsed.data;
    return auth.withDb(async (tx) => {
      const guard = await requireThesisAccess(tx, id, auth.user.id, "comment", startedAt);
      if (!guard.ok) return guard.response;
      const commentId = await addThesisComment(tx, {
        thesisId: id,
        userId: auth.user.id,
        anchorType: commentData.anchorType,
        anchorId: commentData.anchorId ?? null,
        body: commentData.body,
      });
      return jsonOk({ commentId }, startedAt, 201);
    });
  }
  const submitNote = parsed.data.note;
  try {
    return await auth.withDb(async (tx) => {
      const guard = await requireThesisAccess(tx, id, auth.user.id, "write", startedAt);
      if (!guard.ok) return guard.response;
      const approval = await submitIcApproval(tx, {
        thesisId: id,
        submittedBy: auth.user.id,
        note: submitNote,
      });
      return jsonOk({ approval }, startedAt, 201);
    });
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
    return await auth.withDb(async (tx) => {
      const guard = await requireThesisAccess(tx, id, auth.user.id, "decide", startedAt);
      if (!guard.ok) return guard.response;
      const result = await decideIcApproval(tx, {
        thesisId: id,
        approvalId: parsed.data.approvalId,
        decidedBy: auth.user.id,
        decision: parsed.data.decision,
        decisionNote: parsed.data.decisionNote,
      });
      return jsonOk({ approval: result }, startedAt);
    });
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
