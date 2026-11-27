import { CreateQuarterlyReviewSchema, QuarterlyReviewCreateResponseSchema } from "@kanon/core";
import { createQuarterlyReview, listQuarterlyReviews, listThesisRevisions } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";
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
    const reviews = await listQuarterlyReviews(tx, id);
    return jsonOk({ reviews }, startedAt);
  });
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

  const parsed = CreateQuarterlyReviewSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "季度复盘参数校验失败。"),
      400,
      startedAt,
      "INVALID",
    );
  }

  return auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(tx, id, auth.user.id, "write", startedAt);
    if (!guard.ok) return guard.response;
    const created = await createQuarterlyReview(tx, id, parsed.data, auth.user.id);
    if (!created) {
      return jsonError("未找到对应研究标的。", 404, startedAt, "NOT_FOUND");
    }
    const revisions = await listThesisRevisions(tx, id);
    return jsonOk(
      QuarterlyReviewCreateResponseSchema.parse({
        thesis: created.thesis,
        review: created.review,
        revisions,
      }),
      startedAt,
      201,
    );
  });
}
