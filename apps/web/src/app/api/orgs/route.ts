import { TickerSymbolSchema } from "@kanon/core";
import {
  addRestrictedTicker,
  createOrganization,
  getKanonDb,
  getOrgMemberRole,
  listAuditLogs,
  listRestrictedTickers,
  listUserOrganizations,
  roleMeetsMinimum,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../_lib/auth-session";
import { jsonError, jsonOk } from "../_lib/http";
import { verifySameOrigin } from "../_lib/request-guards";

export const dynamic = "force-dynamic";

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const db = await getKanonDb();
  const [organizations, recentAuditLogs] = await Promise.all([
    listUserOrganizations(db, auth.user.id),
    listAuditLogs(db, auth.user.id, 30),
  ]);
  const restrictedByOrg = await Promise.all(
    organizations.map(async (o) => ({
      orgId: o.id,
      tickers: await listRestrictedTickers(db, o.id),
    })),
  );
  return jsonOk({ organizations, restrictedByOrg, recentAuditLogs }, startedAt);
}

async function handleRestrictTicker(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  userId: string,
  rec: Record<string, unknown>,
  startedAt: number,
) {
  const orgId = typeof rec.orgId === "string" ? rec.orgId : "";
  const parsedTicker = TickerSymbolSchema.safeParse(rec.ticker);
  if (!orgId || !parsedTicker.success) {
    return jsonError("请提供有效组织 ID 与标的代码。", 400, startedAt, "INVALID");
  }
  const role = await getOrgMemberRole(db, orgId, userId);
  if (!roleMeetsMinimum(role, "compliance")) {
    return jsonError("需要合规或管理权限。", 403, startedAt, "FORBIDDEN");
  }
  const restricted = await addRestrictedTicker(db, {
    orgId,
    ticker: parsedTicker.data,
    reason: typeof rec.reason === "string" ? rec.reason : "合规限制期",
    addedBy: userId,
  });
  return jsonOk({ restricted }, startedAt, 201);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const rec = asRecord(await request.json().catch(() => null));
  if (!rec) return jsonError("无效请求体。", 400, startedAt, "INVALID");
  const db = await getKanonDb();

  if (rec.op === "restrict_ticker") {
    return handleRestrictTicker(db, auth.user.id, rec, startedAt);
  }
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  if (name.length < 2 || name.length > 80) {
    return jsonError("组织名称需为 2–80 个字符。", 400, startedAt, "INVALID_ORG");
  }
  const organization = await createOrganization(db, { name, createdBy: auth.user.id });
  return jsonOk({ organization }, startedAt, 201);
}
