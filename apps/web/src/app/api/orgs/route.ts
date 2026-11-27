import { OrgPostRequestSchema } from "@kanon/core";
import {
  createInboxItem,
  listAuditLogs,
  listOrgMembers,
  listPendingOrgInvitations,
  listRestrictedTickers,
  listUserOrganizations,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../_lib/auth-session";
import { withUserDb } from "../_lib/db-context";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../_lib/request-guards";
import { handleOrgMutation } from "./org-mutation-handlers";

export const dynamic = "force-dynamic";

const ORGS_RATE_POLICY = { bucket: "orgs_mutation", maxRequests: 20, windowMs: 600_000 };

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const payload = await auth.withDb(async (tx) => {
    const [organizations, recentAuditLogs, pendingInvitations] = await Promise.all([
      listUserOrganizations(tx, auth.user.id),
      listAuditLogs(tx, auth.user.id, 30),
      listPendingOrgInvitations(tx, auth.user.id),
    ]);
    const [restrictedByOrg, membersByOrg] = await Promise.all([
      Promise.all(
        organizations.map(async (o) => ({
          orgId: o.id,
          tickers: await listRestrictedTickers(tx, o.id),
        })),
      ),
      Promise.all(
        organizations.map(async (o) => ({
          orgId: o.id,
          members: await listOrgMembers(tx, o.id),
        })),
      ),
    ]);
    return { organizations, restrictedByOrg, membersByOrg, recentAuditLogs, pendingInvitations };
  });
  return jsonOk(
    {
      organizations: payload.organizations,
      restrictedByOrg: payload.restrictedByOrg,
      membersByOrg: payload.membersByOrg,
      recentAuditLogs: payload.recentAuditLogs,
      pendingInvitations: payload.pendingInvitations.map((inv) => ({
        id: inv.id,
        orgId: inv.orgId,
        orgName: inv.orgName,
        role: inv.role,
        expiresAt: inv.expiresAt.toISOString(),
      })),
    },
    startedAt,
  );
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const rateErr = await checkPersistentRateLimit(
    request,
    ORGS_RATE_POLICY,
    startedAt,
    auth.user.id,
  );
  if (rateErr) return rateErr;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = OrgPostRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "无效组织操作参数。"), 400, startedAt, "INVALID");
  }
  const result = await auth.withDb((tx) =>
    handleOrgMutation(tx, auth.user.id, parsed.data, startedAt),
  );
  if (result.inviteNotice) {
    const notice = result.inviteNotice;
    await withUserDb(notice.userId, (tx) =>
      createInboxItem(tx, {
        userId: notice.userId,
        kind: "org_invite",
        severity: "info",
        title: "收到买方投研团队邀请",
        body: `邀请角色：${notice.role}。确认接受后才会加入该团队并共享研究与合规规则。`,
        sourceUrl: `org_invite:${notice.invitationId}`,
      }),
    ).catch(() => undefined);
  }
  return result.response;
}
