import { ChangePasswordRequestSchema, ChangePasswordResponseSchema } from "@kanon/core";
import { changeUserPassword, getKanonDb } from "@kanon/core/db";
import { getRawSessionToken, requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { checkRateLimit, verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const PASSWORD_RATE_POLICY = { bucket: "auth_password", maxRequests: 10, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = checkRateLimit(request, PASSWORD_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = ChangePasswordRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "密码输入不合规。"), 400, startedAt, "INVALID");
  }

  const db = await getKanonDb();
  const currentRawToken = await getRawSessionToken();
  const res = await changeUserPassword({
    db,
    userId: auth.user.id,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
    currentRawToken,
  });
  if (!res.ok) {
    return jsonError(res.error, 400, startedAt, "PASSWORD_CHANGE_REJECTED");
  }
  return jsonOk(
    ChangePasswordResponseSchema.parse({
      ok: true,
      revokedOtherSessions: res.revokedOtherSessions,
    }),
    startedAt,
  );
}
