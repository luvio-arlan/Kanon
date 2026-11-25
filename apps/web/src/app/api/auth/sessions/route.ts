import { RevokeOtherSessionsResponseSchema, SessionsListResponseSchema } from "@kanon/core";
import { getKanonDb, listUserSessions, revokeOtherUserSessions } from "@kanon/core/db";
import { getRawSessionToken, requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";
import { verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const db = await getKanonDb();
  const currentRawToken = await getRawSessionToken();
  const sessions = await listUserSessions(db, auth.user.id, currentRawToken);
  return jsonOk(SessionsListResponseSchema.parse({ sessions }), startedAt);
}

export async function DELETE(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const db = await getKanonDb();
  const currentRawToken = await getRawSessionToken();
  const revokedCount = await revokeOtherUserSessions(db, auth.user.id, currentRawToken);
  return jsonOk(RevokeOtherSessionsResponseSchema.parse({ ok: true, revokedCount }), startedAt);
}
