import { OrgPostRequestSchema } from "@kanon/core";
import {
  getKanonDb,
  listAuditLogs,
  listOrgMembers,
  listPendingOrgInvitations,
  listRestrictedTickers,
  listUserOrganizations,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../_lib/request-guards";
import { handleOrgMutation } from "./org-mutation-handlers";

export const dynamic = "force-dynamic";

const ORGS_RATE_POLICY = { bucket: "orgs_mutation", maxRequests: 20, windowMs: 600_000 };

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const db = await getKanonDb();
  const [organizations, recentAuditLogs, pendingInvitations] = await Promise.all([
    listUserOrganizations(db, auth.user.id),
    listAuditLogs(db, auth.user.id, 30),
    listPendingOrgInvitations(db, auth.user.id),
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
  return jsonOk(
    {
      organizations,
      restrictedByOrg,
      membersByOrg,
      recentAuditLogs,
      pendingInvitations: pendingInvitations.map((inv) => ({
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
  const db = await getKanonDb();
  return handleOrgMutation(db, auth.user.id, parsed.data, startedAt);
}
