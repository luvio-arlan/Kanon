import { buildMarketBenchmarks } from "@kanon/ai";
import { getKanonDb, getSecSnapshot } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonError, jsonOk } from "../../_lib/http";
import { parseMarketHeaders } from "../../_lib/market-headers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker")?.trim().toUpperCase();
  const priceRaw = Number(url.searchParams.get("price"));
  if (!ticker) return jsonError("请提供标的代码 ticker。", 400, startedAt, "INVALID");
  const currentPrice = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : 100;

  const db = await getKanonDb();
  const secSnapshot = await getSecSnapshot(db, ticker);
  const benchmarks = await buildMarketBenchmarks({
    ticker,
    currentPrice,
    secSnapshot,
    creds: parseMarketHeaders(request),
  });
  return jsonOk(benchmarks, startedAt);
}
