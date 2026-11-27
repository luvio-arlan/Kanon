import { CreateDisciplineEntrySchema } from "@kanon/core";
import {
  addDisciplineEntry,
  appendAuditLog,
  getThesisIdentity,
  isTickerRestricted,
  type KanonDb,
  listThesisRevisions,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function checkOrgComplianceRestricted(
  db: KanonDb,
  userId: string,
  thesisId: string,
  orgId: string | null,
  action: string,
): Promise<string | null> {
  if (!orgId || (action !== "buy" && action !== "add")) return null;
  const identity = await getThesisIdentity(db, thesisId, userId);
  if (!identity) return null;
  if (await isTickerRestricted(db, orgId, identity.ticker)) {
    return `合规限制拦截：${identity.ticker} 处于所属组织限制交易名单内，禁止买入或加仓。`;
  }
  return null;
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

  const parsed = CreateDisciplineEntrySchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "纪律检查未通过。"),
      400,
      startedAt,
      "DISCIPLINE_BLOCKED",
    );
  }

  return auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(tx, id, auth.user.id, "write", startedAt);
    if (!guard.ok) return guard.response;
    const restrictedMsg = await checkOrgComplianceRestricted(
      tx,
      auth.user.id,
      id,
      guard.access.orgId,
      parsed.data.action,
    );
    if (restrictedMsg) {
      return jsonError(restrictedMsg, 403, startedAt, "COMPLIANCE_RESTRICTED");
    }
    const thesis = await addDisciplineEntry(tx, id, parsed.data, auth.user.id);
    if (!thesis) {
      return jsonError("未找到该研究标的。", 404, startedAt, "NOT_FOUND");
    }
    await appendAuditLog(tx, {
      actorUserId: auth.user.id,
      orgId: guard.access.orgId,
      action: `discipline.${parsed.data.action}`,
      targetType: "thesis",
      targetId: id,
      metadata: { ticker: thesis.ticker, priceAnchor: parsed.data.priceAnchor },
    }).catch(() => undefined);
    const revisions = await listThesisRevisions(tx, id);
    return jsonOk({ thesis, revisions }, startedAt, 201);
  });
}
