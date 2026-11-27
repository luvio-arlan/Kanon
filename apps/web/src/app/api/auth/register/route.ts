import { AuthSuccessResponseSchema, RegisterRequestSchema } from "@kanon/core";
import { registerUser } from "@kanon/core/db";
import { setSessionCookie } from "../../_lib/auth-session";
import { withSystemDb } from "../../_lib/db-context";
import {
  formatZodError,
  isUniqueConstraintError,
  jsonError,
  jsonOk,
  readJsonBody,
} from "../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const REGISTER_RATE_POLICY = { bucket: "auth_register", maxRequests: 15, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, REGISTER_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = RegisterRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "注册信息格式有误。"), 400, startedAt, "INVALID");
  }

  try {
    const { user, sessionToken, expiresAt } = await withSystemDb("auth_bootstrap", (tx) =>
      registerUser(tx, {
        phone: parsed.data.phone,
        displayName: parsed.data.displayName,
        password: parsed.data.password,
        confirmPassword: parsed.data.confirmPassword,
        seedStarterWorkspace: parsed.data.seedStarterWorkspace,
      }),
    );
    const payload = AuthSuccessResponseSchema.parse({ user, redirectTo: "/" });
    const response = jsonOk(payload, startedAt, 201);
    setSessionCookie(response, sessionToken, expiresAt);
    return response;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return jsonError("该 +86 手机号已完成注册，请直接登录。", 409, startedAt, "PHONE_EXISTS");
    }
    return jsonError("注册失败，请稍后重试。", 500, startedAt, "REGISTER_FAILED");
  }
}
