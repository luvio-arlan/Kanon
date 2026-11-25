import { MCP_WRITE_TOOL_DEFINITIONS } from "./_mcp-write-tools";

const MCP_READ_TOOL_DEFINITIONS = [
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
      "Inspect 14-metric SEC XBRL forensic quality grade, red flags, working capital CCC, and annual/quarterly financials for a tracked ticker.",
    inputSchema: {
      type: "object",
      properties: { ticker: { type: "string", description: "US stock ticker, e.g. NVDA" } },
      required: ["ticker"],
      additionalProperties: false,
    },
  },
  {
    name: "search_sec_filing_excerpts",
    description:
      "Search cached SEC 10-K/10-Q full-text filing sections using BM25 ranking for primary evidence paragraphs and quarter-over-quarter changes.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "US stock ticker, e.g. NVDA or MU" },
        query: { type: "string", description: "Keywords or metrics to search inside filings" },
        limit: { type: "number", description: "Max excerpts to return (default 4, max 8)" },
      },
      required: ["ticker", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_portfolio_calibration",
    description:
      "Compute portfolio-wide cognitive discipline calibration, emotion attribution, Kelly position sizing comparison, and the weekly IC research digest.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

export const MCP_TOOL_DEFINITIONS = [
  ...MCP_READ_TOOL_DEFINITIONS,
  ...MCP_WRITE_TOOL_DEFINITIONS,
] as const;
