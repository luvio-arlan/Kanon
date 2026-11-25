import { ThesisArchiveImportRequestSchema } from "@kanon/core";
import { ArchiveTickerConflictError, getKanonDb, importThesisArchive } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import {
  formatZodError,
  isUniqueConstraintError,
  jsonError,
  jsonOk,
  readJsonBody,
} from "../../_lib/http";
import { verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const MAX_ARCHIVE_IMPORT_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt, MAX_ARCHIVE_IMPORT_BYTES);
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
  try {
    const imported = await importThesisArchive(db, parsed.data, auth.user.id);
    return jsonOk(imported, startedAt, 201);
  } catch (err) {
    if (err instanceof ArchiveTickerConflictError) {
      return jsonError(err.message, 409, startedAt, "TICKER_CONFLICT");
    }
    if (isUniqueConstraintError(err)) {
      return jsonError("该代码档案已存在，请改用「覆盖还原」模式。", 409, startedAt, "CONFLICT");
    }
    throw err;
  }
}
