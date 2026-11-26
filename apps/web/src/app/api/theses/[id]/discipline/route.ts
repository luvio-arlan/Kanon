import { CreateDisciplineEntrySchema } from "@kanon/core";
import {
  addDisciplineEntry,
  appendAuditLog,
  getKanonDb,
  getThesisIdentity,
  isTickerRestricted,
  listThesisRevisions,
  listUserOrganizations,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function checkComplianceRestricted(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  userId: string,
  thesisId: string,
  action: string,
): Promise<string | null> {
  if (action !== "buy" && action !== "add") return null;
  const identity = await getThesisIdentity(db, thesisId, userId);
  if (!identity) return null;
  const orgs = await listUserOrganizations(db, userId);
  for (const org of orgs) {
    if (await isTickerRestricted(db, org.id, identity.ticker)) {
      return `合规限制拦截：${identity.ticker} 处于「${org.name}」限制交易名单内，禁止买入或加仓。`;
    }
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

  const db = await getKanonDb();
  const restrictedMsg = await checkComplianceRestricted(db, auth.user.id, id, parsed.data.action);
  if (restrictedMsg) {
    return jsonError(restrictedMsg, 403, startedAt, "COMPLIANCE_RESTRICTED");
  }
  const thesis = await addDisciplineEntry(db, id, parsed.data, auth.user.id);
  if (!thesis) {
    return jsonError("未找到该研究标的。", 404, startedAt, "NOT_FOUND");
  }
  await appendAuditLog(db, {
    actorUserId: auth.user.id,
    action: `discipline.${parsed.data.action}`,
    targetType: "thesis",
    targetId: id,
    metadata: { ticker: thesis.ticker, priceAnchor: parsed.data.priceAnchor },
  }).catch(() => undefined);
  const revisions = await listThesisRevisions(db, id);
  return jsonOk({ thesis, revisions }, startedAt, 201);
}
