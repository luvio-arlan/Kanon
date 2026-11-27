import { InboxPatchRequestSchema, InboxPostRequestSchema } from "@kanon/core";
import {
  createInboxItem,
  getKanonDb,
  hasCalendarToken,
  issueCalendarToken,
  listAlertRules,
  listInboxItems,
  markAllInboxItemsRead,
  markInboxItemRead,
  upsertAlertRule,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../_lib/http";
import { verifySameOrigin } from "../_lib/request-guards";
import { requireThesisAccess } from "../_lib/thesis-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const db = await getKanonDb();
  const [items, rules, calendarConfigured] = await Promise.all([
    listInboxItems(db, auth.user.id),
    listAlertRules(db, auth.user.id),
    hasCalendarToken(db, auth.user.id),
  ]);
  return jsonOk({ items, rules, calendarConfigured }, startedAt);
}

async function handleUpsertRulePost(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  userId: string,
  data: Extract<ReturnType<typeof InboxPostRequestSchema.parse>, { op: "upsert_rule" }>,
  startedAt: number,
) {
  if (data.thesisId) {
    const guard = await requireThesisAccess(db, data.thesisId, userId, "read", startedAt);
    if (!guard.ok) return guard.response;
  }
  const ruleId = await upsertAlertRule(db, {
    userId,
    thesisId: data.thesisId ?? null,
    kind: data.kind,
    configJson: data.configJson,
    enabled: data.enabled,
  });
  return jsonOk({ ruleId }, startedAt, 201);
}

async function dispatchInboxPost(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  userId: string,
  data: ReturnType<typeof InboxPostRequestSchema.parse>,
  startedAt: number,
) {
  if ("op" in data) {
    if (data.op === "rotate_calendar") {
      return jsonOk({ calendarToken: await issueCalendarToken(db, userId) }, startedAt, 201);
    }
    if (data.op === "mark_all_read") {
      return jsonOk({ ok: true, markedCount: await markAllInboxItemsRead(db, userId) }, startedAt);
    }
    if (data.op === "upsert_rule") {
      return handleUpsertRulePost(db, userId, data, startedAt);
    }
  }
  const id = await createInboxItem(db, {
    userId,
    thesisId: data.thesisId ?? null,
    kind: data.kind,
    severity: data.severity,
    title: data.title,
    body: data.body,
    sourceUrl: data.sourceUrl ?? null,
  });
  return jsonOk({ id }, startedAt, 201);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = InboxPostRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "请提供有效收件箱操作参数。"),
      400,
      startedAt,
      "INVALID_INBOX_ITEM",
    );
  }
  const db = await getKanonDb();
  return dispatchInboxPost(db, auth.user.id, parsed.data, startedAt);
}

export async function PATCH(request: Request) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = InboxPatchRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "缺少 itemId。"), 400, startedAt, "INVALID");
  }
  const db = await getKanonDb();
  if ("markAll" in parsed.data) {
    const markedCount = await markAllInboxItemsRead(db, auth.user.id);
    return jsonOk({ ok: true, markedCount }, startedAt);
  }
  const updated = await markInboxItemRead(db, auth.user.id, parsed.data.itemId);
  return jsonOk({ ok: updated }, startedAt);
}
