import {
  buildAlignedDailyReturns,
  CORRELATED_CLUSTER_CAP_PCT,
  clusterCorrelations,
  computeLedgerPortfolioWeights,
  decomposePortfolioRisk,
  estimateShrunkCovariance,
  PortfolioRiskResponseSchema,
  todayIsoUtc,
} from "@kanon/core";
import type { LoadedMarketData } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";
import { loadAnalyticsContextWithFx } from "../fx-coverage";

export const dynamic = "force-dynamic";

const RISK_HISTORY_CALENDAR_DAYS = 400;

function buildUnavailableRiskResponse(params: {
  accountId: string | null;
  cashWeightPct: number | null;
  holdings: ReadonlyArray<{ ticker: string; weightPct: number }>;
  missingTickers: string[];
  fxMissingTickers?: string[];
  status?: "currency_unconfirmed";
}) {
  const isEmpty = params.holdings.length === 0;
  return PortfolioRiskResponseSchema.parse({
    accountId: params.accountId,
    status: params.status ?? (isEmpty ? "empty" : "insufficient_history"),
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
    fxMissingTickers: params.fxMissingTickers ?? [],
  });
}

function computeDailyCovRiskPayload(params: {
  accountId: string;
  cashWeightPct: number;
  holdings: ReadonlyArray<{ ticker: string; weightPct: number }>;
  market: LoadedMarketData;
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

function riskHistoryFromDate(asOf: string): string {
  return new Date(Date.parse(`${asOf}T00:00:00Z`) - RISK_HISTORY_CALENDAR_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

type RiskContext = Awaited<ReturnType<typeof loadAnalyticsContextWithFx>>;

function buildRiskPayload(ctx: RiskContext, asOfDate: string) {
  if (ctx.kind !== "ready" || ctx.transactions.length === 0) {
    return buildUnavailableRiskResponse({
      accountId: ctx.kind === "no_account" ? null : ctx.accountId,
      cashWeightPct: ctx.kind === "no_account" ? null : 100,
      holdings: [],
      missingTickers: [],
      ...(ctx.kind === "currency_unconfirmed" ? { status: "currency_unconfirmed" as const } : {}),
    });
  }
  const weights = computeLedgerPortfolioWeights({
    transactions: ctx.transactions,
    splitsByTicker: ctx.market.splitsByTicker,
    latestCloseByTicker: ctx.market.latestCloseByTicker,
    baseCurrency: ctx.baseCurrency,
    fxRatesByCurrency: ctx.fxRatesByCurrency,
    asOfDate,
  });
  if (weights.fxMissingTickers.length > 0 || weights.holdings.length === 0) {
    return buildUnavailableRiskResponse({
      accountId: ctx.accountId,
      cashWeightPct: weights.fxMissingTickers.length > 0 ? null : weights.cashWeightPct,
      holdings: [],
      missingTickers: [],
      fxMissingTickers: weights.fxMissingTickers,
    });
  }
  return computeDailyCovRiskPayload({
    accountId: ctx.accountId,
    cashWeightPct: weights.cashWeightPct,
    holdings: weights.holdings,
    market: ctx.market,
  });
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || null;
  const asOfDate = todayIsoUtc();
  const ctx = await loadAnalyticsContextWithFx(
    auth.withDb,
    { userId: auth.user.id, accountId, minHistoryFromDate: riskHistoryFromDate(asOfDate) },
    "/api/portfolio/risk",
  );
  return jsonOk(buildRiskPayload(ctx, asOfDate), startedAt);
}
