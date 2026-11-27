import { UpdateProfileRequestSchema, UpdateProfileResponseSchema } from "@kanon/core";
import { updateUserProfile } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = UpdateProfileRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "称呼格式无效。"), 400, startedAt, "INVALID");
  }

  const updated = await auth.withDb((tx) =>
    updateUserProfile(tx, auth.user.id, parsed.data.displayName),
  );
  if (!updated) {
    return jsonError("未找到账号记录。", 404, startedAt, "NOT_FOUND");
  }
  return jsonOk(UpdateProfileResponseSchema.parse({ user: updated }), startedAt);
}
