import { listThesisRevisions } from "@kanon/core/db";
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
  return auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(tx, id, auth.user.id, "read", startedAt);
    if (!guard.ok) return guard.response;
    const revisions = await listThesisRevisions(tx, id);
    return jsonOk({ revisions }, startedAt);
  });
}
