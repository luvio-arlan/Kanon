import {
  analyzeSecForensics,
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculatePortfolioAnalytics,
  calculateResearchReadiness,
} from "@kanon/core";
import {
  getKanonDb,
  getLatestAgentRun,
  getSecSnapshot,
  listInboundCrossChecks,
  listQuarterlyReviews,
  listTheses,
} from "@kanon/core/db";
import { requireMcpAuthContext } from "../../_lib/auth-session";
import { jsonError, jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

async function buildSingleTickerContext(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  thesis: Awaited<ReturnType<typeof listTheses>>[number],
  userId: string,
) {
  const [secSnapshot, reviews, latestAgentRun, inboundCrossChecks] = await Promise.all([
    getSecSnapshot(db, thesis.ticker),
    listQuarterlyReviews(db, thesis.id),
    getLatestAgentRun(db, thesis.id),
    listInboundCrossChecks(db, thesis.id, userId),
  ]);
  const secQuality = analyzeSecQuality(secSnapshot?.annuals ?? []);
  const secForensics = analyzeSecForensics(
    secSnapshot?.annuals ?? [],
    secSnapshot?.quarterlies ?? [],
  );
  return {
    schemaVersion: "kanon-mcp-context/v1",
    scope: "ticker" as const,
    thesis,
    readiness: calculateResearchReadiness(thesis),
    expectations: calculateImpliedExpectations({
      summary: thesis.valuation,
      trailingEps: secQuality?.latestEps,
    }),
    secQuality,
    secForensics,
    inboundCrossChecks,
    quarterlyReviews: reviews,
    latestAgentBriefing: latestAgentRun?.briefing ?? null,
  };
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireMcpAuthContext(request, startedAt);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  const db = await getKanonDb();
  const theses = await listTheses(db, auth.user.id);

  if (ticker) {
    const match = theses.find((t) => t.ticker.toUpperCase() === ticker);
    if (!match) {
      return jsonError(`研究库中未找到代码为 ${ticker} 的标的。`, 404, startedAt, "NOT_FOUND");
    }
    const payload = await buildSingleTickerContext(db, match, auth.user.id);
    return jsonOk(payload, startedAt);
  }

  const analytics = calculatePortfolioAnalytics(theses);
  return jsonOk(
    {
      schemaVersion: "kanon-mcp-context/v1",
      scope: "portfolio" as const,
      analytics,
      theses: theses.map((t) => ({
        id: t.id,
        ticker: t.ticker,
        companyName: t.companyName,
        sectorTag: t.sectorTag,
        status: t.status,
        portfolioRole: t.portfolioRole,
        currentWeightPct: t.currentWeightPct,
        targetMaxWeightPct: t.targetMaxWeightPct,
        currentPrice: t.currentPrice,
        baseTargetPrice: t.valuation.base.targetPrice,
        riskRewardRatio: t.valuation.riskRewardRatio,
        baseCagrPct: t.valuation.base.cagrPct,
        readinessScorePct: calculateResearchReadiness(t).scorePct,
      })),
    },
    startedAt,
  );
}
