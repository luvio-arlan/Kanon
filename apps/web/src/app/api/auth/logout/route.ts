import { getKanonDb, revokeSession } from "@kanon/core/db";
import { clearAuthCookies, getRawSessionToken } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";
import { verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const token = await getRawSessionToken();
  if (token) {
    const db = await getKanonDb();
    await revokeSession(db, token);
  }
  const response = jsonOk({ ok: true }, startedAt);
  clearAuthCookies(response);
  return response;
}
