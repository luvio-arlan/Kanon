import {
  CreateApiTokenRequestSchema,
  CreateApiTokenResponseSchema,
  DeleteOkResponseSchema,
  ListApiTokensResponseSchema,
} from "@kanon/core";
import { createApiToken, getKanonDb, listApiTokens, revokeApiToken } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { checkRateLimit, verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const TOKEN_CREATE_POLICY = { bucket: "auth_tokens", maxRequests: 15, windowMs: 15 * 60 * 1000 };

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const db = await getKanonDb();
  const tokens = await listApiTokens(db, auth.user.id);
  return jsonOk(ListApiTokensResponseSchema.parse({ tokens }), startedAt);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = checkRateLimit(request, TOKEN_CREATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = CreateApiTokenRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "令牌参数不合法。"), 400, startedAt, "INVALID");
  }

  const db = await getKanonDb();
  const existing = await listApiTokens(db, auth.user.id);
  if (existing.length >= 12) {
    return jsonError(
      "每个账号最多同时持有 12 个访问令牌，请先撤销旧令牌。",
      400,
      startedAt,
      "LIMIT",
    );
  }
  const created = await createApiToken(db, auth.user.id, parsed.data);
  return jsonOk(CreateApiTokenResponseSchema.parse(created), startedAt, 201);
}

export async function DELETE(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return jsonError("请指定要撤销的令牌 ID。", 400, startedAt, "INVALID");
  }
  const db = await getKanonDb();
  const deleted = await revokeApiToken(db, auth.user.id, id);
  if (!deleted) {
    return jsonError("未找到对应访问令牌。", 404, startedAt, "NOT_FOUND");
  }
  return jsonOk(DeleteOkResponseSchema.parse({ ok: true }), startedAt);
}
