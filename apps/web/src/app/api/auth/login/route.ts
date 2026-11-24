import { AuthSuccessResponseSchema, LoginRequestSchema } from "@kanon/core";
import { authenticateUser, getKanonDb } from "@kanon/core/db";
import { setSessionCookie } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = performance.now();
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
