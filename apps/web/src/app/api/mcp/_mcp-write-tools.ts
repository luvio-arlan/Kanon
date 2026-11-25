import crypto from "node:crypto";
import {
  type ApiTokenScope,
  CreateQuarterlyReviewSchema,
  type CrossCheck,
  CrossCheckSchema,
  type ThesisCatalyst,
  ThesisCatalystSchema,
} from "@kanon/core";
import {
  createQuarterlyReview,
  type KanonDb,
  listTheses,
  recordThesisRevision,
  updateThesisStep,
} from "@kanon/core/db";

export const MCP_WRITE_TOOL_DEFINITIONS = [
  {
    name: "append_cross_check_note",
    description:
      "Append a verified supply-chain or peer cross-check note (Step 3) to an existing thesis. Requires read_write PAT scope.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "US stock ticker, e.g. NVDA" },
        peerCompany: { type: "string", description: "Peer / customer / supplier company name" },
        peerRole: { type: "string", enum: ["upstream", "downstream", "competitor", "primary"] },
        topic: { type: "string" },
        sourceAnchor: { type: "string" },
        statement: { type: "string" },
        alignment: { type: "string", enum: ["aligned", "divergent", "pending"] },
        takeaway: { type: "string" },
        hypothesisId: { type: "string", description: "Optional hypothesis ID to link evidence" },
      },
      required: [
        "ticker",
        "peerCompany",
        "peerRole",
        "topic",
        "sourceAnchor",
        "statement",
        "alignment",
        "takeaway",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "add_catalyst_event",
    description:
      "Add an upcoming catalyst milestone (Step 2) to a tracked thesis. Requires read_write PAT scope.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        title: { type: "string" },
        dateLabel: { type: "string", description: "e.g. FY27 Q1 or 2026-10-15" },
        category: {
          type: "string",
          enum: ["earnings", "product", "capital", "regulatory", "macro"],
        },
        impact: { type: "string", enum: ["high", "medium"] },
        direction: { type: "string", enum: ["bullish", "bearish", "binary"] },
        verificationMetric: { type: "string" },
        note: { type: "string" },
      },
      required: [
        "ticker",
        "title",
        "dateLabel",
        "category",
        "impact",
        "direction",
        "verificationMetric",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "draft_quarterly_review",
    description:
      "Record a structured quarterly thesis review and optional hypothesis verdicts (Step 5). Requires read_write PAT scope.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        quarterLabel: { type: "string" },
        summary: { type: "string" },
        hypothesisVerdicts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              hypothesisId: { type: "string" },
              title: { type: "string" },
              verdict: { type: "string", enum: ["strengthened", "unchanged", "weakened"] },
              evidence: { type: "string" },
            },
            required: ["hypothesisId", "title", "verdict", "evidence"],
          },
        },
        applyStatusUpdates: { type: "boolean" },
      },
      required: ["ticker", "quarterLabel", "summary", "hypothesisVerdicts"],
      additionalProperties: false,
    },
  },
] as const;

const WRITE_TOOL_NAMES = new Set<string>(MCP_WRITE_TOOL_DEFINITIONS.map((t) => t.name));

export function isMcpWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name);
}

async function resolveThesisByTicker(db: KanonDb, userId: string, args: Record<string, unknown>) {
  const ticker = typeof args.ticker === "string" ? args.ticker.trim().toUpperCase() : "";
  if (!ticker) return { error: "Missing required argument: ticker" } as const;
  const theses = await listTheses(db, userId);
  const match = theses.find((t) => t.ticker.toUpperCase() === ticker);
  if (!match) return { error: `未找到标的 ${ticker} 的研究档案。` } as const;
  return { thesis: match } as const;
}

async function runAppendCrossCheck(db: KanonDb, userId: string, args: Record<string, unknown>) {
  const resolved = await resolveThesisByTicker(db, userId, args);
  if ("error" in resolved) return { isError: true, payload: { error: resolved.error } };
  const candidate: CrossCheck = {
    id: `cc-mcp-${crypto.randomUUID().slice(0, 6)}`,
    peerCompany: typeof args.peerCompany === "string" ? args.peerCompany.trim() : "",
    peerRole: (typeof args.peerRole === "string"
      ? args.peerRole
      : "primary") as CrossCheck["peerRole"],
    topic: typeof args.topic === "string" ? args.topic.trim() : "",
    sourceAnchor: typeof args.sourceAnchor === "string" ? args.sourceAnchor.trim() : "",
    statement: typeof args.statement === "string" ? args.statement.trim() : "",
    alignment: (typeof args.alignment === "string"
      ? args.alignment
      : "pending") as CrossCheck["alignment"],
    takeaway: typeof args.takeaway === "string" ? args.takeaway.trim() : "",
    hypothesisId: typeof args.hypothesisId === "string" ? args.hypothesisId.trim() : null,
  };
  const parsed = CrossCheckSchema.safeParse(candidate);
  if (!parsed.success)
    return { isError: true, payload: { error: parsed.error.issues[0]?.message } };
  const updated = await updateThesisStep(
    db,
    resolved.thesis.id,
    { step: "cross_checks", crossChecks: [...resolved.thesis.crossChecks, parsed.data] },
    userId,
  );
  if (updated) {
    await recordThesisRevision(
      db,
      updated,
      "cross_checks",
      `来源：MCP 外部协作 · 新增 ${parsed.data.peerCompany} 交叉印证`,
    );
  }
  return { payload: { ok: true, id: parsed.data.id, ticker: resolved.thesis.ticker } };
}

async function runAddCatalyst(db: KanonDb, userId: string, args: Record<string, unknown>) {
  const resolved = await resolveThesisByTicker(db, userId, args);
  if ("error" in resolved) return { isError: true, payload: { error: resolved.error } };
  const candidate: ThesisCatalyst = {
    id: `cat-mcp-${crypto.randomUUID().slice(0, 6)}`,
    title: typeof args.title === "string" ? args.title.trim() : "",
    dateLabel: typeof args.dateLabel === "string" ? args.dateLabel.trim() : "",
    category: (typeof args.category === "string"
      ? args.category
      : "earnings") as ThesisCatalyst["category"],
    impact: (typeof args.impact === "string" ? args.impact : "medium") as ThesisCatalyst["impact"],
    direction: (typeof args.direction === "string"
      ? args.direction
      : "bullish") as ThesisCatalyst["direction"],
    status: "upcoming",
    verificationMetric:
      typeof args.verificationMetric === "string" ? args.verificationMetric.trim() : "",
    note: typeof args.note === "string" ? args.note.trim() : "",
  };
  const parsed = ThesisCatalystSchema.safeParse(candidate);
  if (!parsed.success)
    return { isError: true, payload: { error: parsed.error.issues[0]?.message } };
  const updated = await updateThesisStep(
    db,
    resolved.thesis.id,
    { step: "catalysts", catalysts: [...resolved.thesis.catalysts, parsed.data] },
    userId,
  );
  if (updated) {
    await recordThesisRevision(
      db,
      updated,
      "catalysts",
      `来源：MCP 外部协作 · 新增催化剂 ${parsed.data.title}`,
    );
  }
  return { payload: { ok: true, id: parsed.data.id, ticker: resolved.thesis.ticker } };
}

async function runDraftReview(db: KanonDb, userId: string, args: Record<string, unknown>) {
  const resolved = await resolveThesisByTicker(db, userId, args);
  if ("error" in resolved) return { isError: true, payload: { error: resolved.error } };
  const parsed = CreateQuarterlyReviewSchema.safeParse({
    quarterLabel: args.quarterLabel,
    summary: args.summary,
    hypothesisVerdicts: args.hypothesisVerdicts,
    applyStatusUpdates:
      typeof args.applyStatusUpdates === "boolean" ? args.applyStatusUpdates : true,
  });
  if (!parsed.success)
    return { isError: true, payload: { error: parsed.error.issues[0]?.message } };
  const created = await createQuarterlyReview(db, resolved.thesis.id, parsed.data, userId);
  if (!created) return { isError: true, payload: { error: "写入季度复盘失败。" } };
  return { payload: { ok: true, reviewId: created.review.id, ticker: resolved.thesis.ticker } };
}

export async function executeMcpWriteToolCall(
  db: KanonDb,
  userId: string,
  name: string,
  args: Record<string, unknown>,
  scope: ApiTokenScope,
): Promise<{ isError?: boolean; payload: unknown }> {
  if (scope !== "read_write") {
    return {
      isError: true,
      payload: { error: "Forbidden: write tools require a read_write PAT scope." },
    };
  }
  if (name === "append_cross_check_note") return runAppendCrossCheck(db, userId, args);
  if (name === "add_catalyst_event") return runAddCatalyst(db, userId, args);
  if (name === "draft_quarterly_review") return runDraftReview(db, userId, args);
  return { isError: true, payload: { error: `Unknown MCP write tool: ${name}` } };
}
