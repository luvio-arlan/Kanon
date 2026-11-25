import {
  analyzeSecForensics,
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculatePortfolioAnalytics,
  calculateResearchReadiness,
} from "@kanon/core";
import {
  getLatestAgentRun,
  getSecSnapshot,
  type KanonDb,
  listInboundCrossChecks,
  listQuarterlyReviews,
  listTheses,
} from "@kanon/core/db";

export const MCP_TOOL_DEFINITIONS = [
  {
    name: "list_portfolio_theses",
    description:
      "List all tracked investment theses in the authenticated KANON workspace with valuation risk/reward, base CAGR, readiness score, and portfolio analytics.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_thesis_dossier",
    description:
      "Get the full 5-step fundamental research dossier for a single US equity ticker, including hypotheses, Reverse-DCF implied expectations, SEC forensic quality, quarterly reviews, and latest IC briefing.",
    inputSchema: {
      type: "object",
      properties: { ticker: { type: "string", description: "US stock ticker, e.g. NVDA or MU" } },
      required: ["ticker"],
      additionalProperties: false,
    },
  },
  {
    name: "list_upcoming_catalysts",
    description:
      "List upcoming catalysts across active KANON theses, optionally filtered by ticker or high impact.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Optional ticker filter" },
        onlyHighImpact: { type: "boolean", description: "Return only high-impact catalysts" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_sec_forensics",
    description:
      "Inspect 14-metric SEC XBRL forensic quality grade, red flags, and annual/quarterly financials for a tracked ticker.",
    inputSchema: {
      type: "object",
      properties: { ticker: { type: "string", description: "US stock ticker, e.g. NVDA" } },
      required: ["ticker"],
      additionalProperties: false,
    },
  },
] as const;

async function handleThesisDossier(db: KanonDb, userId: string, tickerRaw: string) {
  const ticker = tickerRaw.trim().toUpperCase();
  const theses = await listTheses(db, userId);
  const match = theses.find((t) => t.ticker.toUpperCase() === ticker);
  if (!match) return { error: `未找到标的 ${ticker} 的研究档案。` };

  const [secSnapshot, reviews, latestAgentRun, inboundCrossChecks] = await Promise.all([
    getSecSnapshot(db, match.ticker),
    listQuarterlyReviews(db, match.id),
    getLatestAgentRun(db, match.id),
    listInboundCrossChecks(db, match.id),
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

async function handleSecForensics(db: KanonDb, tickerRaw: string) {
  const ticker = tickerRaw.trim().toUpperCase();
  const snap = await getSecSnapshot(db, ticker);
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

export async function executeMcpToolCall(
  db: KanonDb,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError?: boolean; payload: unknown }> {
  if (name === "list_portfolio_theses") {
    return { payload: await handlePortfolioSummary(db, userId) };
  }
  if (name === "get_thesis_dossier") {
    const ticker = typeof args.ticker === "string" ? args.ticker : "";
    if (!ticker) return { isError: true, payload: { error: "Missing required argument: ticker" } };
    return { payload: await handleThesisDossier(db, userId, ticker) };
  }
  if (name === "list_upcoming_catalysts") {
    return { payload: await handleCatalystsList(db, userId, args) };
  }
  if (name === "get_sec_forensics") {
    const ticker = typeof args.ticker === "string" ? args.ticker : "";
    if (!ticker) return { isError: true, payload: { error: "Missing required argument: ticker" } };
    return { payload: await handleSecForensics(db, ticker) };
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
