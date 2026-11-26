import { AuthSuccessResponseSchema, LoginRequestSchema } from "@kanon/core";
import {
  checkAccountLockout,
  clearAccountLockout,
  finalizeUserLogin,
  getKanonDb,
  getUserTotpStatus,
  recordFailedLoginAttempt,
  verifyUserCredentials,
  verifyUserTotpFactor,
} from "@kanon/core/db";
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

function buildLockoutResponse(retryAfterSec: number, startedAt: number) {
  const res = jsonError(
    `连续登录失败次数过多，请 ${retryAfterSec} 秒后再试。`,
    429,
    startedAt,
    "ACCOUNT_LOCKED",
  );
  res.headers.set("Retry-After", String(retryAfterSec));
  return res;
}

async function verifyTotpIfEnabled(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  userId: string,
  phone: string,
  totpCode: string | undefined,
  startedAt: number,
) {
  const totp = await getUserTotpStatus(db, userId);
  if (!totp.enabled) return null;
  const code = totpCode?.trim() ?? "";
  if (!code) {
    return jsonError(
      "该账号已开启两步验证，请输入 6 位动态验证码。",
      401,
      startedAt,
      "TOTP_REQUIRED",
    );
  }
  const ok = await verifyUserTotpFactor(db, userId, code);
  if (ok) return null;
  await recordFailedLoginAttempt(db, phone);
  return jsonError("两步验证码或恢复码不正确。", 401, startedAt, "INVALID_TOTP");
}

async function verifyLoginChallenge(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  parsed: { phone: string; password: string; totpCode?: string },
  startedAt: number,
) {
  const lockout = await checkAccountLockout(db, parsed.phone);
  if (lockout.locked) {
    return {
      ok: false as const,
      response: buildLockoutResponse(lockout.retryAfterSec, startedAt),
    };
  }
  const user = await verifyUserCredentials(db, parsed);
  if (!user) {
    const failed = await recordFailedLoginAttempt(db, parsed.phone);
    if (failed.retryAfterSec > 0) {
      return {
        ok: false as const,
        response: buildLockoutResponse(failed.retryAfterSec, startedAt),
      };
    }
    return {
      ok: false as const,
      response: jsonError(
        "手机号或密码不正确，请核对后重试。",
        401,
        startedAt,
        "INVALID_CREDENTIALS",
      ),
    };
  }
  const totpErr = await verifyTotpIfEnabled(db, user.id, parsed.phone, parsed.totpCode, startedAt);
  if (totpErr) return { ok: false as const, response: totpErr };
  return { ok: true as const, user };
}

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
  const challenge = await verifyLoginChallenge(db, parsed.data, startedAt);
  if (!challenge.ok) return challenge.response;

  await clearAccountLockout(db, parsed.data.phone);
  const session = await finalizeUserLogin(db, challenge.user.id);
  const payload = AuthSuccessResponseSchema.parse({ user: challenge.user, redirectTo: "/" });
  const response = jsonOk(payload, startedAt, 200);
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
