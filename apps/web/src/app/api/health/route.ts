import { getKanonDb, pingKanonDb } from "@kanon/core/db";
import { jsonError, jsonOk } from "../_lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  try {
    const db = await getKanonDb();
    await pingKanonDb(db);
    return jsonOk(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        secUserAgentConfigured: Boolean(process.env.KANON_SEC_USER_AGENT?.trim()),
      },
      startedAt,
    );
  } catch (err) {
    void err;
    return jsonError("数据库连接自检失败。", 503, startedAt, "DB_UNAVAILABLE");
  }
}
