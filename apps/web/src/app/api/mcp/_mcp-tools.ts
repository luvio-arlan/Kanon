import { searchFilingExcerpts } from "@kanon/ai";
import {
  type ApiTokenScope,
  analyzeSecForensics,
  analyzeSecQuality,
  buildWeeklyIcDigest,
  calculateImpliedExpectations,
  calculatePortfolioAnalytics,
  calculatePortfolioCalibration,
  calculateResearchReadiness,
  type QuarterlyReview,
} from "@kanon/core";
import {
  getLatestAgentRun,
  getSecSnapshotForUser,
  getThesisByTicker,
  type KanonDb,
  listCachedSecFilingDocsByTicker,
  listInboundCrossChecks,
  listQuarterlyReviews,
  listQuarterlyReviewsByThesisIds,
  listTheses,
} from "@kanon/core/db";
import { executeMcpWriteToolCall, isMcpWriteTool } from "./_mcp-write-tools";

export { MCP_TOOL_DEFINITIONS } from "./_mcp-read-schemas";

async function handleThesisDossier(db: KanonDb, userId: string, tickerRaw: string) {
  const ticker = tickerRaw.trim().toUpperCase();
  const match = await getThesisByTicker(db, ticker, userId);
  if (!match) return { error: `未找到标的 ${ticker} 的研究档案。` };

  const [secSnapshot, reviews, latestAgentRun, inboundCrossChecks] = await Promise.all([
    getSecSnapshotForUser(db, match.ticker, userId),
    listQuarterlyReviews(db, match.id),
    getLatestAgentRun(db, match.id),
    listInboundCrossChecks(db, match.id, userId),
  ]);
  const secQuality = analyzeSecQuality(secSnapshot?.annuals ?? []);
  const secForensics = analyzeSecForensics(
    secSnapshot?.annuals ?? [],
    secSnapshot?.quarterlies ?? [],
  );
  return {
    thesis: match,
    readiness: calculateResearchReadiness(match),
    expectations: calculateImpliedExpectations({
      summary: match.valuation,
      trailingEps: secQuality?.latestEps,
    }),
    secQuality,
    secForensics,
    inboundCrossChecks,
    quarterlyReviews: reviews,
    latestAgentBriefing: latestAgentRun?.briefing ?? null,
  };
}

async function handlePortfolioSummary(db: KanonDb, userId: string) {
  const theses = await listTheses(db, userId);
  return {
    analytics: calculatePortfolioAnalytics(theses),
    theses: theses.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      companyName: t.companyName,
      sectorTag: t.sectorTag,
      status: t.status,
      portfolioRole: t.portfolioRole,
      currentWeightPct: t.currentWeightPct,
      currentPrice: t.currentPrice,
      baseTargetPrice: t.valuation.base.targetPrice,
      riskRewardRatio: t.valuation.riskRewardRatio,
      baseCagrPct: t.valuation.base.cagrPct,
      readinessScorePct: calculateResearchReadiness(t).scorePct,
      upcomingCatalystsCount: t.catalysts.filter((c) => c.status === "upcoming").length,
    })),
  };
}

async function handleCatalystsList(db: KanonDb, userId: string, args: Record<string, unknown>) {
  const tickerFilter = typeof args.ticker === "string" ? args.ticker.trim().toUpperCase() : "";
  const onlyHigh = args.onlyHighImpact === true;
  const theses = await listTheses(db, userId);
  const items = theses
    .filter((t) => t.status === "active" && (!tickerFilter || t.ticker === tickerFilter))
    .flatMap((t) =>
      t.catalysts
        .filter((c) => c.status === "upcoming" && (!onlyHigh || c.impact === "high"))
        .map((c) => ({
          ticker: t.ticker,
          companyName: t.companyName,
          ...c,
        })),
    );
  return { count: items.length, catalysts: items };
}

async function handleSecForensics(db: KanonDb, userId: string, tickerRaw: string) {
  const ticker = tickerRaw.trim().toUpperCase();
  const snap = await getSecSnapshotForUser(db, ticker, userId);
  if (!snap) return { error: `未找到 ${ticker} 的 SEC 财报缓存。` };
  return {
    ticker: snap.ticker,
    entityName: snap.entityName,
    cik: snap.cik,
    fetchedAt: snap.fetchedAt,
    secQuality: analyzeSecQuality(snap.annuals),
    secForensics: analyzeSecForensics(snap.annuals, snap.quarterlies),
    recentFilings: snap.filings.slice(0, 6),
  };
}

async function handleSearchFilingExcerpts(db: KanonDb, args: Record<string, unknown>) {
  const ticker = typeof args.ticker === "string" ? args.ticker.trim().toUpperCase() : "";
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!ticker || !query) return { error: "Missing required arguments: ticker, query" };
  const docs = await listCachedSecFilingDocsByTicker(db, ticker);
  const limit = typeof args.limit === "number" ? Math.min(8, Math.max(1, args.limit)) : 4;
  const matches = searchFilingExcerpts({ query, filings: docs, limit });
  return { ticker, query, cachedDocsCount: docs.length, matches };
}

async function handlePortfolioCalibration(db: KanonDb, userId: string) {
  const theses = await listTheses(db, userId);
  const reviews = await listQuarterlyReviewsByThesisIds(
    db,
    theses.map((t) => t.id),
  );
  const reviewsMap = new Map<string, QuarterlyReview[]>();
  for (const r of reviews) {
    const bucket = reviewsMap.get(r.thesisId);
    if (bucket) bucket.push(r);
    else reviewsMap.set(r.thesisId, [r]);
  }
  const calibration = calculatePortfolioCalibration(theses, reviewsMap);
  const digest = buildWeeklyIcDigest(theses, calibration);
  return { calibration, digest };
}

export async function executeMcpToolCall(
  db: KanonDb,
  userId: string,
  name: string,
  args: Record<string, unknown>,
  scope: ApiTokenScope = "read",
): Promise<{ isError?: boolean; payload: unknown }> {
  if (isMcpWriteTool(name)) return executeMcpWriteToolCall(db, userId, name, args, scope);
  if (name === "list_portfolio_theses")
    return { payload: await handlePortfolioSummary(db, userId) };
  if (name === "get_portfolio_calibration") {
    return { payload: await handlePortfolioCalibration(db, userId) };
  }
  if (name === "list_upcoming_catalysts")
    return { payload: await handleCatalystsList(db, userId, args) };
  if (name === "search_sec_filing_excerpts")
    return { payload: await handleSearchFilingExcerpts(db, args) };
  const ticker = typeof args.ticker === "string" ? args.ticker : "";
  if (!ticker) return { isError: true, payload: { error: "Missing required argument: ticker" } };
  if (name === "get_thesis_dossier")
    return { payload: await handleThesisDossier(db, userId, ticker) };
  if (name === "get_sec_forensics") {
    return { payload: await handleSecForensics(db, userId, ticker) };
  }
  return { isError: true, payload: { error: `Unknown MCP tool: ${name}` } };
}

export async function listMcpResources(db: KanonDb, userId: string) {
  const theses = await listTheses(db, userId);
  return [
    {
      uri: "kanon://portfolio/summary",
      name: "KANON Portfolio Summary",
      description: "Active portfolio valuation matrix, weights, and concentration analytics",
      mimeType: "application/json",
    },
    ...theses.map((t) => ({
      uri: `kanon://thesis/${t.ticker}`,
      name: `${t.companyName} (${t.ticker}) Investment Dossier`,
      description: `${t.sectorTag} · Base target $${t.valuation.base.targetPrice}`,
      mimeType: "application/json",
    })),
  ];
}

export async function readMcpResource(db: KanonDb, userId: string, uri: string) {
  if (uri === "kanon://portfolio/summary") {
    const data = await handlePortfolioSummary(db, userId);
    return { uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) };
  }
  const match = /^kanon:\/\/thesis\/([A-Za-z0-9.-]{1,10})$/.exec(uri);
  if (match?.[1]) {
    const data = await handleThesisDossier(db, userId, match[1]);
    return { uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) };
  }
  return null;
}
