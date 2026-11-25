import { AuthSuccessResponseSchema, LoginRequestSchema } from "@kanon/core";
import { authenticateUser, getKanonDb } from "@kanon/core/db";
import { setSessionCookie } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const LOGIN_RATE_POLICY = { bucket: "auth_login", maxRequests: 25, windowMs: 15 * 60 * 1000 };
const LOGIN_ACCOUNT_RATE_POLICY = {
  bucket: "auth_login_acct",
  maxRequests: 12,
  windowMs: 15 * 60 * 1000,
};

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, LOGIN_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = LoginRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "请输入有效的 +86 手机号与密码。"),
      400,
      startedAt,
      "INVALID",
    );
  }

  const acctRateErr = await checkPersistentRateLimit(
    request,
    LOGIN_ACCOUNT_RATE_POLICY,
    startedAt,
    parsed.data.phone,
  );
  if (acctRateErr) return acctRateErr;

  const db = await getKanonDb();
  const result = await authenticateUser(db, parsed.data);
  if (!result) {
    return jsonError("手机号或密码不正确，请核对后重试。", 401, startedAt, "INVALID_CREDENTIALS");
  }

  const payload = AuthSuccessResponseSchema.parse({ user: result.user, redirectTo: "/" });
  const response = jsonOk(payload, startedAt, 200);
  setSessionCookie(response, result.sessionToken, result.expiresAt);
  return response;
}
