import {
  buildAlignedDailyReturns,
  CORRELATED_CLUSTER_CAP_PCT,
  clusterCorrelations,
  decomposePortfolioRisk,
  estimateShrunkCovariance,
  PortfolioRiskResponseSchema,
} from "@kanon/core";
import { listTheses, loadUnadjustedMarketDataForTickers } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

function buildSectorFallbackResponse(
  holdings: ReadonlyArray<{ ticker: string; weightPct: number }>,
  missingTickers: string[],
) {
  return PortfolioRiskResponseSchema.parse({
    status: holdings.length === 0 ? "empty" : "insufficient_history",
    basis: "sector_tag",
    windowDays: 0,
    annualizedVolPct: null,
    portfolioBeta: null,
    diversificationRatio: null,
    effectiveNumHoldings: null,
    effectiveNumBets: null,
    shrinkageIntensity: null,
    clusterCapPct: CORRELATED_CLUSTER_CAP_PCT,
    contributions: holdings.map((h) => ({
      ticker: h.ticker,
      weightPct: h.weightPct,
      standaloneVolPct: null,
      mcrPct: null,
      pcrPct: null,
      betaVsSpy: null,
    })),
    clusters: [],
    missingTickers,
  });
}

function computeDailyCovRiskPayload(
  holdings: ReadonlyArray<{ ticker: string; weightPct: number }>,
  market: Awaited<ReturnType<typeof loadUnadjustedMarketDataForTickers>>,
) {
  const weightByTicker = new Map(holdings.map((h) => [h.ticker, h.weightPct]));
  const aligned = buildAlignedDailyReturns({
    tickers: holdings.map((h) => h.ticker),
    barsByTicker: market.barsByTicker,
    dividendsByTicker: market.dividendsByTicker,
    spyBars: market.spyBars,
    spyDividends: market.spyDividends,
    minDays: 60,
    maxDays: 252,
  });
  if (aligned.includedTickers.length === 0 || aligned.dates.length < 60) {
    return buildSectorFallbackResponse(holdings, aligned.missingTickers);
  }
  const weightsPct = aligned.includedTickers.map((t) => weightByTicker.get(t) ?? 0);
  const cov = estimateShrunkCovariance(aligned.returnSeries);
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
    status: "ready",
    basis: "daily_cov",
    windowDays: aligned.dates.length,
    ...decomp,
    shrinkageIntensity: cov.shrinkageIntensity,
    clusterCapPct: CORRELATED_CLUSTER_CAP_PCT,
    clusters,
    missingTickers: aligned.missingTickers,
  });
}

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { holdings, market } = await auth.withDb(async (tx) => {
    const theses = await listTheses(tx, auth.user.id);
    const active = theses
      .filter((t) => t.status === "active" && t.currentWeightPct > 0)
      .map((t) => ({ ticker: t.ticker.toUpperCase(), weightPct: t.currentWeightPct }));
    const mkt = await loadUnadjustedMarketDataForTickers(
      tx,
      active.map((a) => a.ticker),
    );
    return { holdings: active, market: mkt };
  });
  if (holdings.length === 0) return jsonOk(buildSectorFallbackResponse([], []), startedAt);
  return jsonOk(computeDailyCovRiskPayload(holdings, market), startedAt);
}
