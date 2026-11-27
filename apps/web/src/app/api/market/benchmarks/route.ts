import { buildMarketBenchmarks } from "@kanon/ai";
import { TickerSymbolSchema, todayIsoUtc } from "@kanon/core";
import {
  computeRealHistoricalValuationBand,
  getFactsAsOf,
  getSecSnapshot,
  getSecSnapshotForUser,
  getSecurityByTicker,
  getThesisByTicker,
  type KanonDb,
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

async function loadHistoricalBandInputs(db: KanonDb, securityId: string | undefined) {
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

async function computeBenchmarksForLoaded(params: {
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>;
  ticker: string;
  currentPrice: number;
  secSnapshot: Awaited<ReturnType<typeof getSecSnapshotForUser>>;
  customPeers: Awaited<ReturnType<typeof listThesisPeers>>;
  bandData: Awaited<ReturnType<typeof loadHistoricalBandInputs>>;
  request: Request;
}) {
  const historicalValuationBand =
    params.secSnapshot && params.bandData.bars.length >= 20
      ? computeRealHistoricalValuationBand({
          bars: params.bandData.bars,
          annuals: params.secSnapshot.annuals,
          pitEpsFacts: params.bandData.pitEpsFacts,
          splits: params.bandData.splits,
          currentPrice: params.currentPrice,
        })
      : null;
  return buildMarketBenchmarks({
    ticker: params.ticker,
    currentPrice: params.currentPrice,
    secSnapshot: params.secSnapshot,
    customPeerTickers: params.customPeers.map((p) => p.ticker),
    historicalValuationBand,
    loadCachedPeers: async (peerTickers) => {
      const snaps = await params.withDb((tx) =>
        Promise.all(peerTickers.map((pt) => getSecSnapshot(tx, pt))),
      );
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

  const loaded = await auth.withDb(async (tx) => {
    const [secSnapshot, thesisIdentity, security] = await Promise.all([
      getSecSnapshotForUser(tx, ticker, auth.user.id),
      getThesisByTicker(tx, ticker, auth.user.id),
      getSecurityByTicker(tx, ticker),
    ]);
    const [customPeers, bandData] = await Promise.all([
      thesisIdentity?.id ? listThesisPeers(tx, thesisIdentity.id) : Promise.resolve([]),
      loadHistoricalBandInputs(tx, security?.id),
    ]);
    return { secSnapshot, thesisIdentity, customPeers, bandData };
  });
  const currentPrice = resolveBenchmarkPrice(
    url.searchParams.get("price"),
    loaded.thesisIdentity?.currentPrice,
  );
  if (currentPrice === null) {
    return jsonError(
      "缺少有效现价 price 参数，无法计算估值基准。",
      400,
      startedAt,
      "INVALID_PRICE",
    );
  }
  const benchmarks = await computeBenchmarksForLoaded({
    withDb: auth.withDb,
    ticker,
    currentPrice,
    secSnapshot: loaded.secSnapshot,
    customPeers: loaded.customPeers,
    bandData: loaded.bandData,
    request,
  });
  return jsonOk(benchmarks, startedAt);
}
