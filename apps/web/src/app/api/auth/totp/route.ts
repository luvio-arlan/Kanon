import {
  TotpActionRequestSchema,
  TotpDisableRequestSchema,
  TotpEnrollResponseSchema,
  TotpStatusResponseSchema,
} from "@kanon/core";
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableUserTotpFactor,
  getKanonDb,
  getUserTotpStatus,
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
  const db = await getKanonDb();
  const status = await getUserTotpStatus(db, auth.user.id);
  return jsonOk(TotpStatusResponseSchema.parse(status), startedAt);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, TOTP_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
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
  const db = await getKanonDb();
  if (parsed.data.action === "begin") {
    const enrolled = await beginTotpEnrollment(db, auth.user.id, auth.user.phoneE164);
    return jsonOk(TotpEnrollResponseSchema.parse(enrolled), startedAt, 200);
  }
  const confirmed = await confirmTotpEnrollment(db, auth.user.id, parsed.data.code);
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
  const rateErr = await checkPersistentRateLimit(request, TOTP_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = TotpDisableRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError("请提供 6 位动态验证码或恢复码以停用两步验证。", 400, startedAt, "INVALID");
  }
  const db = await getKanonDb();
  const disabled = await disableUserTotpFactor(db, auth.user.id, parsed.data.code);
  if (!disabled) {
    return jsonError("动态验证码或恢复码无效。", 400, startedAt, "INVALID_TOTP");
  }
  return jsonOk({ ok: true as const, enabled: false }, startedAt, 200);
}
