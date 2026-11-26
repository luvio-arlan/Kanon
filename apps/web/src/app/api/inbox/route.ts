import {
  createInboxItem,
  getKanonDb,
  issueCalendarToken,
  listAlertRules,
  listInboxItems,
  markInboxItemRead,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../_lib/auth-session";
import { jsonError, jsonOk } from "../_lib/http";
import { verifySameOrigin } from "../_lib/request-guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const db = await getKanonDb();
  const [items, rules, calendarToken] = await Promise.all([
    listInboxItems(db, auth.user.id),
    listAlertRules(db, auth.user.id),
    issueCalendarToken(db, auth.user.id),
  ]);
  return jsonOk({ items, rules, calendarToken }, startedAt);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const bodyUnknown: unknown = await request.json().catch(() => null);
  const raw =
    bodyUnknown && typeof bodyUnknown === "object"
      ? (bodyUnknown as Record<string, unknown>)
      : null;
  const title = typeof raw?.title === "string" ? raw.title.trim() : "";
  const body = typeof raw?.body === "string" ? raw.body.trim() : "";
  if (!title || !body) {
    return jsonError("请提供有效提醒标题与内容。", 400, startedAt, "INVALID_INBOX_ITEM");
  }
  const db = await getKanonDb();
  const id = await createInboxItem(db, {
    userId: auth.user.id,
    thesisId: typeof raw?.thesisId === "string" ? raw.thesisId : null,
    kind: typeof raw?.kind === "string" ? raw.kind : "manual",
    severity: raw?.severity === "critical" || raw?.severity === "warn" ? raw.severity : "info",
    title,
    body,
  });
  return jsonOk({ id }, startedAt, 201);
}

export async function PATCH(request: Request) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const bodyUnknown: unknown = await request.json().catch(() => null);
  const raw =
    bodyUnknown && typeof bodyUnknown === "object"
      ? (bodyUnknown as Record<string, unknown>)
      : null;
  const itemId = typeof raw?.itemId === "string" ? raw.itemId.trim() : "";
  if (!itemId) return jsonError("缺少 itemId。", 400, startedAt, "INVALID");
  const db = await getKanonDb();
  const updated = await markInboxItemRead(db, auth.user.id, itemId);
  return jsonOk({ ok: updated }, startedAt);
}
