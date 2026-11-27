import { getKanonDb, listThesisRevisions } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { jsonOk } from "../../../_lib/http";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const db = await getKanonDb();
  const guard = await requireThesisAccess(db, id, auth.user.id, "read", startedAt);
  if (!guard.ok) return guard.response;
  const revisions = await listThesisRevisions(db, id);
  return jsonOk({ revisions }, startedAt);
}
