import {
  buildAlignedDailyReturns,
  CORRELATED_CLUSTER_CAP_PCT,
  clusterCorrelations,
  decomposePortfolioRisk,
  estimateShrunkCovariance,
  PortfolioRiskResponseSchema,
  todayIsoUtc,
} from "@kanon/core";
import {
  computeLedgerPortfolioWeights,
  type KanonDb,
  loadTenantAccountAndTransactions,
  loadUnadjustedMarketDataForTickers,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

function buildUnavailableRiskResponse(params: {
  accountId: string | null;
  cashWeightPct: number | null;
  holdings: ReadonlyArray<{ ticker: string; weightPct: number }>;
  missingTickers: string[];
}) {
  const isEmpty = params.holdings.length === 0;
  return PortfolioRiskResponseSchema.parse({
    accountId: params.accountId,
    status: isEmpty ? "empty" : "insufficient_history",
    basis: isEmpty ? "empty" : "insufficient_history",
    cashWeightPct: params.cashWeightPct,
    windowDays: 0,
    annualizedVolPct: null,
    portfolioBeta: null,
    diversificationRatio: null,
    effectiveNumHoldings: null,
    effectiveNumBets: null,
    shrinkageIntensity: null,
    clusterCapPct: CORRELATED_CLUSTER_CAP_PCT,
    contributions: params.holdings.map((h) => ({
      ticker: h.ticker,
      weightPct: h.weightPct,
      standaloneVolPct: null,
      mcrPct: null,
      pcrPct: null,
      betaVsSpy: null,
    })),
    clusters: [],
    missingTickers: params.missingTickers,
  });
}

function computeDailyCovRiskPayload(params: {
  accountId: string;
  cashWeightPct: number;
  holdings: ReadonlyArray<{ ticker: string; weightPct: number }>;
  market: Awaited<ReturnType<typeof loadUnadjustedMarketDataForTickers>>;
}) {
  const aligned = buildAlignedDailyReturns({
    tickers: params.holdings.map((h) => h.ticker),
    barsByTicker: params.market.barsByTicker,
    dividendsByTicker: params.market.dividendsByTicker,
    spyBars: params.market.spyBars,
    spyDividends: params.market.spyDividends,
    minDays: 60,
    maxDays: 252,
  });
  const cov =
    aligned.includedTickers.length > 0 && aligned.dates.length >= 60
      ? estimateShrunkCovariance(aligned.returnSeries)
      : null;
  if (!cov) {
    return buildUnavailableRiskResponse({ ...params, missingTickers: aligned.missingTickers });
  }
  const weightByTicker = new Map(params.holdings.map((h) => [h.ticker, h.weightPct]));
  const weightsPct = aligned.includedTickers.map((t) => weightByTicker.get(t) ?? 0);
  const decomp = decomposePortfolioRisk({
    tickers: aligned.includedTickers,
    weights: weightsPct.map((w) => w / 100),
    covariance: cov.covariance,
    assetReturns: aligned.returnSeries,
    spyReturns: aligned.spyReturns,
  });
  const clusters = clusterCorrelations({
    tickers: aligned.includedTickers,
    weightsPct,
    correlation: cov.correlation,
  });
  return PortfolioRiskResponseSchema.parse({
    accountId: params.accountId,
    status: "ready",
    basis: "ledger_daily_cov",
    cashWeightPct: params.cashWeightPct,
    windowDays: aligned.dates.length,
    ...decomp,
    shrinkageIntensity: cov.shrinkageIntensity,
    clusterCapPct: CORRELATED_CLUSTER_CAP_PCT,
    clusters,
    missingTickers: aligned.missingTickers,
  });
}

async function loadRiskInputs(tx: KanonDb, userId: string, accountId: string | null) {
  const { account, transactions } = await loadTenantAccountAndTransactions(tx, userId, accountId);
  if (!account) return null;
  const tickers = transactions.map((t) => t.ticker).filter((t) => t !== "CASH");
  const market = await loadUnadjustedMarketDataForTickers(tx, tickers);
  return { account, transactions, market };
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || null;
  const loaded = await auth.withDb((tx) => loadRiskInputs(tx, auth.user.id, accountId));
  if (!loaded || loaded.transactions.length === 0) {
    return jsonOk(
      buildUnavailableRiskResponse({
        accountId: loaded?.account.id ?? null,
        cashWeightPct: loaded ? 100 : null,
        holdings: [],
        missingTickers: [],
      }),
      startedAt,
    );
  }
  const weights = computeLedgerPortfolioWeights({
    transactions: loaded.transactions.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      action: t.action,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      tradeDate: t.tradeDate,
      createdAtMs: t.createdAt.getTime(),
      isOpeningBalance: t.externalRef === "opening_balance",
    })),
    splitsByTicker: loaded.market.splitsByTicker,
    latestCloseByTicker: loaded.market.latestCloseByTicker,
    asOfDate: todayIsoUtc(),
  });
  const payload =
    weights.holdings.length === 0
      ? buildUnavailableRiskResponse({
          accountId: loaded.account.id,
          cashWeightPct: weights.cashWeightPct,
          holdings: [],
          missingTickers: [],
        })
      : computeDailyCovRiskPayload({
          accountId: loaded.account.id,
          cashWeightPct: weights.cashWeightPct,
          holdings: weights.holdings,
          market: loaded.market,
        });
  return jsonOk(payload, startedAt);
}
