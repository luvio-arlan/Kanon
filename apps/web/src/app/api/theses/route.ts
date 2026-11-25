import { CreateThesisInputSchema } from "@kanon/core";
import { createThesis, getKanonDb, listGlossaryTerms, listTheses } from "@kanon/core/db";
import { requireWorkspaceContext } from "../_lib/auth-session";
import {
  formatZodError,
  isUniqueConstraintError,
  jsonError,
  jsonOk,
  readJsonBody,
} from "../_lib/http";
import { verifySameOrigin } from "../_lib/request-guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const db = await getKanonDb();
  const [theses, glossary] = await Promise.all([
    listTheses(db, auth.user.id),
    listGlossaryTerms(db),
  ]);
  return jsonOk({ theses, glossary }, startedAt);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = CreateThesisInputSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "标的参数校验失败。"), 400, startedAt, "INVALID");
  }

  try {
    const db = await getKanonDb();
    const thesis = await createThesis(db, parsed.data, auth.user.id);
    return jsonOk({ thesis }, startedAt, 201);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return jsonError(
        `标的 ${parsed.data.ticker} 已在跟踪列表中，请直接进入原画布编辑。`,
        409,
        startedAt,
        "CONFLICT",
      );
    }
    return jsonError("创建标的失败，请检查输入后重试。", 500, startedAt, "CREATE_FAILED");
  }
}
