import { buildMarketBenchmarks } from "@kanon/ai";
import { TickerSymbolSchema, todayIsoUtc } from "@kanon/core";
import {
  computeRealHistoricalValuationBand,
  getFactsAsOf,
  getKanonDb,
  getSecSnapshot,
  getSecSnapshotForUser,
  getSecurityByTicker,
  getThesisByTicker,
  listCorporateActions,
  listPriceBars,
  listThesisPeers,
} from "@kanon/core/db";
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

function resolveBenchmarkPrice(
  priceParam: string | null,
  thesisPrice: number | undefined,
): number | null {
  const parsed = priceParam ? Number(priceParam) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return thesisPrice && thesisPrice > 0 ? thesisPrice : null;
}

async function loadHistoricalBandInputs(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  securityId: string | undefined,
) {
  if (!securityId) return { bars: [], pitEpsFacts: [], splits: [] };
  const [bars, pitEpsFacts, corpActions] = await Promise.all([
    listPriceBars(db, securityId),
    getFactsAsOf(db, { securityId, concept: "diluted_eps", asOfDate: todayIsoUtc() }),
    listCorporateActions(db, securityId),
  ]);
  const splits = corpActions
    .filter(
      (a): a is typeof a & { ratio: number } =>
        a.kind === "split" && typeof a.ratio === "number" && a.ratio > 0,
    )
    .map((a) => ({ exDate: a.exDate, ratio: a.ratio }));
  return { bars, pitEpsFacts, splits };
}

async function computeBenchmarksResponse(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  params: {
    ticker: string;
    currentPrice: number;
    secSnapshot: Awaited<ReturnType<typeof getSecSnapshotForUser>>;
    thesisId?: string;
    securityId?: string;
    request: Request;
  },
) {
  const [customPeers, bandData] = await Promise.all([
    params.thesisId ? listThesisPeers(db, params.thesisId) : Promise.resolve([]),
    loadHistoricalBandInputs(db, params.securityId),
  ]);
  const historicalValuationBand =
    params.secSnapshot && bandData.bars.length >= 20
      ? computeRealHistoricalValuationBand({
          bars: bandData.bars,
          annuals: params.secSnapshot.annuals,
          pitEpsFacts: bandData.pitEpsFacts,
          splits: bandData.splits,
          currentPrice: params.currentPrice,
        })
      : null;
  return buildMarketBenchmarks({
    ticker: params.ticker,
    currentPrice: params.currentPrice,
    secSnapshot: params.secSnapshot,
    customPeerTickers: customPeers.map((p) => p.ticker),
    historicalValuationBand,
    loadCachedPeers: async (peerTickers) => {
      const snaps = await Promise.all(peerTickers.map((pt) => getSecSnapshot(db, pt)));
      const map = new Map<string, NonNullable<(typeof snaps)[number]>>();
      for (const s of snaps) if (s) map.set(s.ticker.toUpperCase(), s);
      return map;
    },
    creds: parseMarketHeaders(params.request),
  });
}

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

  const db = await getKanonDb();
  const [secSnapshot, thesisIdentity, security] = await Promise.all([
    getSecSnapshotForUser(db, ticker, auth.user.id),
    getThesisByTicker(db, ticker, auth.user.id),
    getSecurityByTicker(db, ticker),
  ]);
  const currentPrice = resolveBenchmarkPrice(
    url.searchParams.get("price"),
    thesisIdentity?.currentPrice,
  );
  if (currentPrice === null) {
    return jsonError(
      "缺少有效现价 price 参数，无法计算估值基准。",
      400,
      startedAt,
      "INVALID_PRICE",
    );
  }
  const benchmarks = await computeBenchmarksResponse(db, {
    ticker,
    currentPrice,
    secSnapshot,
    thesisId: thesisIdentity?.id,
    securityId: security?.id,
    request,
  });
  return jsonOk(benchmarks, startedAt);
}
