import { assertThesisOwnership, getKanonDb, listThesisRevisions } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { jsonError, jsonOk } from "../../../_lib/http";

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
  if (!(await assertThesisOwnership(db, id, auth.user.id))) {
    return jsonError("未找到该研究标的。", 404, startedAt, "NOT_FOUND");
  }
  const revisions = await listThesisRevisions(db, id);
  return jsonOk({ revisions }, startedAt);
}
