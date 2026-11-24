import { AuthSuccessResponseSchema } from "@kanon/core";
import { getDemoUser, getKanonDb } from "@kanon/core/db";
import { getServerAuthContext, setDemoCookie } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  const startedAt = performance.now();
  const current = await getServerAuthContext();
  if (current.user && !current.isDemo) {
    return jsonOk(
      AuthSuccessResponseSchema.parse({ user: current.user, redirectTo: "/" }),
      startedAt,
    );
  }
  const db = await getKanonDb();
  const demoUser = await getDemoUser(db);
  const response = jsonOk(
    AuthSuccessResponseSchema.parse({ user: demoUser, redirectTo: "/" }),
    startedAt,
  );
  setDemoCookie(response);
  return response;
}
