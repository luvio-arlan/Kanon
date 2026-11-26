import {
  addThesisComment,
  assertThesisOwnership,
  decideIcApproval,
  getKanonDb,
  listIcApprovals,
  listThesisComments,
  submitIcApproval,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { jsonError, jsonOk } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";

export const dynamic = "force-dynamic";

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

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

async function handleAddComment(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  thesisId: string,
  userId: string,
  rec: Record<string, unknown>,
  startedAt: number,
) {
  const body = typeof rec.body === "string" ? rec.body.trim() : "";
  if (!body) return jsonError("批注内容不能为空。", 400, startedAt, "INVALID_COMMENT");
  const commentId = await addThesisComment(db, {
    thesisId,
    userId,
    anchorType: typeof rec.anchorType === "string" ? rec.anchorType : "thesis",
    anchorId: typeof rec.anchorId === "string" ? rec.anchorId : null,
    body,
  });
  return jsonOk({ commentId }, startedAt, 201);
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
  const rec = asRecord(await request.json().catch(() => null));
  if (!rec) return jsonError("无效请求体。", 400, startedAt, "INVALID");
  if (rec.op === "comment") return handleAddComment(db, id, auth.user.id, rec, startedAt);

  const approval = await submitIcApproval(db, {
    thesisId: id,
    orgId: typeof rec.orgId === "string" ? rec.orgId : null,
    submittedBy: auth.user.id,
    snapshotPayload: rec.snapshotPayload ?? { thesisId: id },
  });
  return jsonOk({ approval }, startedAt, 201);
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
  const rec = asRecord(await request.json().catch(() => null));
  const approvalId = typeof rec?.approvalId === "string" ? rec.approvalId : "";
  const decision = rec?.decision;
  if (
    !approvalId ||
    (decision !== "approved" && decision !== "rejected" && decision !== "archived")
  ) {
    return jsonError("请提供有效审批 ID 与决议状态。", 400, startedAt, "INVALID_DECISION");
  }
  try {
    const result = await decideIcApproval(db, {
      approvalId,
      decidedBy: auth.user.id,
      decision,
      decisionNote: typeof rec?.decisionNote === "string" ? rec.decisionNote : "",
    });
    return jsonOk({ approval: result }, startedAt);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "审批失败。",
      403,
      startedAt,
      "FORBIDDEN",
    );
  }
}
