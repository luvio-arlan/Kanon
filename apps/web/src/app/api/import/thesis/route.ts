import { ThesisArchiveImportRequestSchema } from "@kanon/core";
import { getKanonDb, importThesisArchive } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = ThesisArchiveImportRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "JSON 备份格式无效，请导入 KANON 导出的 archive.json 文件。"),
      400,
      startedAt,
      "INVALID_ARCHIVE",
    );
  }

  const db = await getKanonDb();
  const imported = await importThesisArchive(db, parsed.data, auth.user.id);
  return jsonOk(imported, startedAt, 201);
}
