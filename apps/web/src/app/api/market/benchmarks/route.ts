import { buildMarketBenchmarks } from "@kanon/ai";
import { TickerSymbolSchema } from "@kanon/core";
import { getKanonDb, getSecSnapshot, getSecSnapshotForUser } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonError, jsonOk } from "../../_lib/http";
import { parseMarketHeaders } from "../../_lib/market-headers";
import { checkPersistentRateLimit } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const BENCHMARKS_RATE_POLICY = {
  bucket: "market_benchmarks",
  maxRequests: 40,
  windowMs: 60 * 1000,
};

export async function GET(request: Request) {
  const startedAt = performance.now();
  const rateErr = await checkPersistentRateLimit(request, BENCHMARKS_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsedTicker = TickerSymbolSchema.safeParse(url.searchParams.get("ticker") ?? "");
  if (!parsedTicker.success)
    return jsonError("请提供有效标的代码 ticker。", 400, startedAt, "INVALID");
  const ticker = parsedTicker.data;
  const priceRaw = Number(url.searchParams.get("price"));
  const currentPrice = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : 100;

  const db = await getKanonDb();
  const secSnapshot = await getSecSnapshotForUser(db, ticker, auth.user.id);
  const benchmarks = await buildMarketBenchmarks({
    ticker,
    currentPrice,
    secSnapshot,
    loadCachedPeers: async (peerTickers) => {
      const snaps = await Promise.all(peerTickers.map((pt) => getSecSnapshot(db, pt)));
      const map = new Map<string, NonNullable<(typeof snaps)[number]>>();
      for (const s of snaps) if (s) map.set(s.ticker.toUpperCase(), s);
      return map;
    },
    creds: parseMarketHeaders(request),
  });
  return jsonOk(benchmarks, startedAt);
}
