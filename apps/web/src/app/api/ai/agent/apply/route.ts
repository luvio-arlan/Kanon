import { AgentApplyRequestSchema, AgentApplyResponseSchema } from "@kanon/core";
import { applyAgentProposalsAtomic, getAgentRunThesisId, getKanonDb } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../../_lib/request-guards";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

const APPLY_RATE_POLICY = { bucket: "ai_agent_apply", maxRequests: 40, windowMs: 60 * 1000 };

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, APPLY_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = AgentApplyRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "提案参数不合法。"), 400, startedAt, "INVALID");
  }

  const proposalIds = parsed.data.proposalIds?.length
    ? parsed.data.proposalIds
    : parsed.data.proposalId
      ? [parsed.data.proposalId]
      : [];

  const db = await getKanonDb();
  const thesisId = await getAgentRunThesisId(db, parsed.data.runId);
  if (!thesisId) {
    return jsonError("未找到对应的 Agent 审计记录。", 404, startedAt, "NOT_FOUND");
  }
  const guard = await requireThesisAccess(db, thesisId, auth.user.id, "write", startedAt);
  if (!guard.ok) return guard.response;

  const applied = await applyAgentProposalsAtomic(db, {
    runId: parsed.data.runId,
    proposalIds,
    userId: auth.user.id,
  });
  if (!applied) {
    return jsonError("未找到对应的 Agent 审计记录。", 404, startedAt, "NOT_FOUND");
  }
  return jsonOk(
    AgentApplyResponseSchema.parse({
      ok: true,
      appliedProposalIds: applied.appliedProposalIds,
      thesis: applied.thesis,
      revisions: applied.revisions,
      promotedExitRules: applied.promotedExitRules,
    }),
    startedAt,
  );
}
