import { normalizeChinaPhone, OrgPostRequestSchema } from "@kanon/core";
import {
  addOrgMember,
  addRestrictedTicker,
  appendAuditLog,
  assignThesisToOrganization,
  createOrganization,
  findUserByPhoneE164,
  getKanonDb,
  getOrgMemberRole,
  hasOrgCapability,
  listAuditLogs,
  listOrgMembers,
  listRestrictedTickers,
  listUserOrganizations,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../_lib/http";
import { verifySameOrigin } from "../_lib/request-guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const db = await getKanonDb();
  const [organizations, recentAuditLogs] = await Promise.all([
    listUserOrganizations(db, auth.user.id),
    listAuditLogs(db, auth.user.id, 30),
  ]);
  const [restrictedByOrg, membersByOrg] = await Promise.all([
    Promise.all(
      organizations.map(async (o) => ({
        orgId: o.id,
        tickers: await listRestrictedTickers(db, o.id),
      })),
    ),
    Promise.all(
      organizations.map(async (o) => ({
        orgId: o.id,
        members: await listOrgMembers(db, o.id),
      })),
    ),
  ]);
  return jsonOk({ organizations, restrictedByOrg, membersByOrg, recentAuditLogs }, startedAt);
}

type DbInstance = Awaited<ReturnType<typeof getKanonDb>>;

async function handleAddMember(
  db: DbInstance,
  userId: string,
  data: {
    orgId: string;
    phone: string;
    role: "owner" | "pm" | "analyst" | "viewer" | "compliance";
  },
  startedAt: number,
) {
  const role = await getOrgMemberRole(db, data.orgId, userId);
  if (!hasOrgCapability(role, "org.manage_members")) {
    return jsonError("权限不足：仅组织管理员可邀请成员。", 403, startedAt, "FORBIDDEN");
  }
  const phone = normalizeChinaPhone(data.phone);
  if (!phone) return jsonError("请输入有效的 +86 手机号。", 400, startedAt, "INVALID_PHONE");
  const target = await findUserByPhoneE164(db, phone);
  if (!target) {
    return jsonError("未找到该手机号对应的 KANON 账号。", 404, startedAt, "USER_NOT_FOUND");
  }
  await addOrgMember(db, { orgId: data.orgId, userId: target.id, role: data.role });
  await appendAuditLog(db, {
    actorUserId: userId,
    orgId: data.orgId,
    action: "org.add_member",
    targetType: "membership",
    targetId: target.id,
    metadata: { role: data.role },
  });
  return jsonOk(
    { member: { userId: target.id, displayName: target.displayName, role: data.role } },
    startedAt,
    201,
  );
}

async function handleAssignThesis(
  db: DbInstance,
  userId: string,
  data: { orgId: string | null; thesisId: string },
  startedAt: number,
) {
  if (data.orgId) {
    const role = await getOrgMemberRole(db, data.orgId, userId);
    if (!hasOrgCapability(role, "thesis.edit")) {
      return jsonError("权限不足：无法将研究关联至该组织。", 403, startedAt, "FORBIDDEN");
    }
  }
  const updated = await assignThesisToOrganization(db, {
    thesisId: data.thesisId,
    userId,
    orgId: data.orgId,
  });
  if (!updated) {
    return jsonError("标的研究不存在或无权变更归属。", 404, startedAt, "NOT_FOUND");
  }
  return jsonOk({ thesis: updated }, startedAt);
}

async function handleOrgMutation(
  db: DbInstance,
  userId: string,
  data: ReturnType<typeof OrgPostRequestSchema.parse>,
  startedAt: number,
) {
  if ("op" in data && data.op === "restrict_ticker") {
    const role = await getOrgMemberRole(db, data.orgId, userId);
    if (!hasOrgCapability(role, "compliance.restrict")) {
      return jsonError("权限不足：仅合规官或管理员可维护限制名单。", 403, startedAt, "FORBIDDEN");
    }
    const restricted = await addRestrictedTicker(db, {
      orgId: data.orgId,
      ticker: data.ticker,
      reason: data.reason,
      addedBy: userId,
    });
    return jsonOk({ restricted }, startedAt, 201);
  }
  if ("op" in data && data.op === "add_member") {
    return handleAddMember(db, userId, data, startedAt);
  }
  if ("op" in data && data.op === "assign_thesis") {
    return handleAssignThesis(db, userId, data, startedAt);
  }
  const organization = await createOrganization(db, { name: data.name, createdBy: userId });
  return jsonOk({ organization }, startedAt, 201);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = OrgPostRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "无效组织操作参数。"), 400, startedAt, "INVALID");
  }
  const db = await getKanonDb();
  return handleOrgMutation(db, auth.user.id, parsed.data, startedAt);
}
