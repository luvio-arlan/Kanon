import { fetchSecEdgarSnapshot } from "@kanon/ai";
import { getKanonDb, getSecSnapshot, upsertSecSnapshot } from "@kanon/core/db";
import { jsonOk } from "../../_lib/http";
import { verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const { ticker } = await context.params;
  const db = await getKanonDb();
  const snapshot = await getSecSnapshot(db, ticker);
  return jsonOk({ snapshot }, startedAt);
}

export async function POST(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const { ticker } = await context.params;
  const db = await getKanonDb();
  const fetched = await fetchSecEdgarSnapshot(ticker);

  if (fetched.ok) {
    const saved = await upsertSecSnapshot(db, fetched.data);
    return jsonOk(
      {
        snapshot: saved,
        live: true,
        notice: `已从 SEC EDGAR 官方接口同步 ${saved.entityName} 最新 10-K/10-Q 与财务锚点。`,
      },
      startedAt,
    );
  }

  const cached = await getSecSnapshot(db, ticker);
  return jsonOk(
    {
      snapshot: cached,
      live: false,
      notice: fetched.error,
    },
    startedAt,
  );
}
