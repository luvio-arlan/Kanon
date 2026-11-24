import { getKanonDb, getThesisById, listThesisRevisions } from "@kanon/core/db";
import { jsonError, jsonOk } from "../../../_lib/http";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const { id } = await context.params;
  const db = await getKanonDb();
  const thesis = await getThesisById(db, id);
  if (!thesis) {
    return jsonError("未找到该研究标的。", 404, startedAt, "NOT_FOUND");
  }
  const revisions = await listThesisRevisions(db, id);
  return jsonOk({ revisions }, startedAt);
}
