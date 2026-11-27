import {
  analyzeSecForensics,
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculatePortfolioAnalytics,
  calculateResearchReadiness,
} from "@kanon/core";
import {
  getLatestAgentRun,
  getSecSnapshotForUser,
  getThesisByTicker,
  type KanonDb,
  listInboundCrossChecks,
  listQuarterlyReviews,
  listTheses,
} from "@kanon/core/db";
import { requireMcpAuthContext } from "../../_lib/auth-session";
import { jsonError, jsonOk } from "../../_lib/http";
import { checkPersistentRateLimit } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const MCP_CONTEXT_RATE_POLICY = { bucket: "mcp_context", maxRequests: 60, windowMs: 60 * 1000 };

async function buildSingleTickerContext(
  db: KanonDb,
  thesis: Awaited<ReturnType<typeof listTheses>>[number],
  userId: string,
) {
  const [secSnapshot, reviews, latestAgentRun, inboundCrossChecks] = await Promise.all([
    getSecSnapshotForUser(db, thesis.ticker, userId),
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
  const rateErr = await checkPersistentRateLimit(request, MCP_CONTEXT_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireMcpAuthContext(request, startedAt);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  if (ticker) {
    const payload = await auth.withDb(async (tx) => {
      const match = await getThesisByTicker(tx, ticker, auth.user.id);
      if (!match) return null;
      return buildSingleTickerContext(tx, match, auth.user.id);
    });
    if (!payload) {
      return jsonError(`研究库中未找到代码为 ${ticker} 的标的。`, 404, startedAt, "NOT_FOUND");
    }
    return jsonOk(payload, startedAt);
  }
  const theses = await auth.withDb((tx) => listTheses(tx, auth.user.id));

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
