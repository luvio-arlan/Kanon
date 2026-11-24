import { getKanonDb, revokeSession } from "@kanon/core/db";
import { clearAuthCookies, getRawSessionToken } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  const startedAt = performance.now();
  const token = await getRawSessionToken();
  if (token) {
    const db = await getKanonDb();
    await revokeSession(db, token);
  }
  const response = jsonOk({ ok: true }, startedAt);
  clearAuthCookies(response);
  return response;
}
