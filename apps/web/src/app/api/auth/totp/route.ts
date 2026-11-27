import {
  TotpActionRequestSchema,
  TotpDisableRequestSchema,
  TotpEnrollResponseSchema,
  TotpStatusResponseSchema,
} from "@kanon/core";
import {
  beginTotpEnrollment,
  checkAccountLockout,
  clearAccountLockout,
  confirmTotpEnrollment,
  disableUserTotpFactor,
  getUserTotpStatus,
  recordFailedLoginAttempt,
  TotpAlreadyEnabledError,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const TOTP_RATE_POLICY = { bucket: "auth_totp", maxRequests: 20, windowMs: 15 * 60 * 1000 };

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const status = await auth.withDb((tx) => getUserTotpStatus(tx, auth.user.id));
  return jsonOk(TotpStatusResponseSchema.parse(status), startedAt);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const rateErr = await checkPersistentRateLimit(
    request,
    TOTP_RATE_POLICY,
    startedAt,
    auth.user.id,
  );
  if (rateErr) return rateErr;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = TotpActionRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "两步验证请求参数无效。"),
      400,
      startedAt,
      "INVALID",
    );
  }
  if (parsed.data.action === "begin") {
    try {
      const enrolled = await auth.withDb((tx) =>
        beginTotpEnrollment(tx, auth.user.id, auth.user.phoneE164),
      );
      return jsonOk(TotpEnrollResponseSchema.parse(enrolled), startedAt, 200);
    } catch (err) {
      if (err instanceof TotpAlreadyEnabledError) {
        return jsonError(err.message, 409, startedAt, "TOTP_ALREADY_ENABLED");
      }
      throw err;
    }
  }
  const code = parsed.data.code;
  const confirmed = await auth.withDb((tx) => confirmTotpEnrollment(tx, auth.user.id, code));
  if (!confirmed.ok) {
    return jsonError(
      "动态验证码校验失败，请核对认证器时间后重试。",
      400,
      startedAt,
      "INVALID_TOTP",
    );
  }
  return jsonOk({ enabled: true, recoveryCodes: confirmed.recoveryCodes }, startedAt, 200);
}

export async function DELETE(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const rateErr = await checkPersistentRateLimit(
    request,
    TOTP_RATE_POLICY,
    startedAt,
    auth.user.id,
  );
  if (rateErr) return rateErr;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = TotpDisableRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError("请提供 6 位动态验证码或恢复码以停用两步验证。", 400, startedAt, "INVALID");
  }
  const lockKey = `totp_disable:${auth.user.id}`;
  return auth.withDb(async (tx) => {
    const lock = await checkAccountLockout(tx, lockKey);
    if (lock.locked) {
      return jsonError(
        `尝试次数过多，请 ${lock.retryAfterSec} 秒后再试。`,
        429,
        startedAt,
        "TOTP_LOCKED",
      );
    }
    const disabled = await disableUserTotpFactor(tx, auth.user.id, parsed.data.code);
    if (!disabled) {
      await recordFailedLoginAttempt(tx, lockKey);
      return jsonError("动态验证码或恢复码无效。", 400, startedAt, "INVALID_TOTP");
    }
    await clearAccountLockout(tx, lockKey);
    return jsonOk({ ok: true as const, enabled: false }, startedAt, 200);
  });
}
