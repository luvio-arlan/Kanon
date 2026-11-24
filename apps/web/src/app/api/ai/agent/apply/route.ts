import { AgentApplyRequestSchema, AgentApplyResponseSchema } from "@kanon/core";
import { getKanonDb, markAgentProposalApplied } from "@kanon/core/db";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = AgentApplyRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "提案参数不合法。"), 400, startedAt, "INVALID");
  }

  const db = await getKanonDb();
  const applied = await markAgentProposalApplied(db, parsed.data.runId, parsed.data.proposalId);
  if (!applied) {
    return jsonError("未找到对应的 Agent 审计记录。", 404, startedAt, "NOT_FOUND");
  }
  return jsonOk(
    AgentApplyResponseSchema.parse({ ok: true, appliedProposalIds: applied }),
    startedAt,
  );
}
