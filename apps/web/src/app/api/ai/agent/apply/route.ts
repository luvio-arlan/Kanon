import { AgentApplyRequestSchema, AgentApplyResponseSchema } from "@kanon/core";
import { applyAgentProposalsAtomic, getAgentRunThesisId } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../../_lib/request-guards";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

const APPLY_RATE_POLICY = { bucket: "ai_agent_apply", maxRequests: 40, windowMs: 60 * 1000 };

function resolveProposalIds(data: { proposalIds?: string[]; proposalId?: string }) {
  if (data.proposalIds?.length) return data.proposalIds;
  return data.proposalId ? [data.proposalId] : [];
}

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
  const proposalIds = resolveProposalIds(parsed.data);
  const outcome = await auth.withDb(async (tx) => {
    const thesisId = await getAgentRunThesisId(tx, parsed.data.runId);
    if (!thesisId) {
      return {
        ok: false as const,
        response: jsonError("未找到对应的 Agent 审计记录。", 404, startedAt, "NOT_FOUND"),
      };
    }
    const guard = await requireThesisAccess(tx, thesisId, auth.user.id, "write", startedAt);
    if (!guard.ok) return { ok: false as const, response: guard.response };
    const applied = await applyAgentProposalsAtomic(tx, {
      runId: parsed.data.runId,
      proposalIds,
      userId: auth.user.id,
    });
    if (!applied) {
      return {
        ok: false as const,
        response: jsonError("未找到对应的 Agent 审计记录。", 404, startedAt, "NOT_FOUND"),
      };
    }
    return { ok: true as const, applied };
  });
  if (!outcome.ok) return outcome.response;
  const { applied } = outcome;
  return jsonOk(AgentApplyResponseSchema.parse({ ok: true, ...applied }), startedAt);
}
