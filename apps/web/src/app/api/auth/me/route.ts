import { AuthSessionResponseSchema } from "@kanon/core";
import { getServerAuthContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const ctx = await getServerAuthContext();
  return jsonOk(AuthSessionResponseSchema.parse(ctx), startedAt);
}
