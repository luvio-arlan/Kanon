import { CreateDisciplineEntrySchema } from "@kanon/core";
import { addDisciplineEntry, getKanonDb, listThesisRevisions } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = CreateDisciplineEntrySchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "纪律检查未通过。"),
      400,
      startedAt,
      "DISCIPLINE_BLOCKED",
    );
  }

  const db = await getKanonDb();
  const thesis = await addDisciplineEntry(db, id, parsed.data, auth.user.id);
  if (!thesis) {
    return jsonError("未找到该研究标的。", 404, startedAt, "NOT_FOUND");
  }
  const revisions = await listThesisRevisions(db, id);
  return jsonOk({ thesis, revisions }, startedAt, 201);
}
