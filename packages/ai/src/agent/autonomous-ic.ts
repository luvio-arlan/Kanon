import {
  analyzeSecForensics,
  evaluateHypothesisKpi,
  type MarketBenchmarkResponse,
  type QuarterlyReview,
  type ResearchNote,
  type SecFilingReaderResponse,
  type SecSnapshot,
  type ThesisDetail,
} from "@kanon/core";
import { generateText, type LanguageModel, stepCountIs, tool } from "ai";
import { z } from "zod";
import { searchFilingExcerpts } from "./filing-search-tool";
import type { AgentTraceStep } from "./types";

export interface AutonomousIcContext {
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
  reviews?: readonly QuarterlyReview[];
  cachedFilings?: readonly SecFilingReaderResponse[];
  researchNotes?: readonly ResearchNote[];
  benchmarks?: MarketBenchmarkResponse | null;
  sourceText?: string;
}

function formatFinancialsPacket(sec: SecSnapshot | null): string {
  if (!sec || sec.annuals.length === 0) return "暂无多年度财报数据。";
  const rows = sec.annuals
    .map(
      (a) =>
        `${a.fiscalYear}: Rev=${a.revenue ? `$${(a.revenue / 1e9).toFixed(1)}B` : "—"}, GM=${a.grossMarginPct ?? "—"}%, FCF=${a.freeCashFlow ? `$${(a.freeCashFlow / 1e9).toFixed(1)}B` : "—"}, EPS=${a.dilutedEps ?? "—"}`,
    )
    .join(" | ");
  const forensics = analyzeSecForensics(sec.annuals, sec.quarterlies);
  const ins = sec.insiderSummary;
  const insider = ins
    ? `Form 4=${ins.signal}(买${ins.openMarketBuysCount}笔$${Math.round(ins.openMarketBuysUsd / 1e3)}K, 卖${ins.openMarketSalesCount}笔其中10b5-1=${ins.routine10b51SalesCount})`
    : "暂无 Form 4";
  return `币种=${sec.reportingCurrency ?? "USD"}(FX=${sec.fxToUsd ?? 1}, ADR=${sec.adrRatio ?? 1}) | ${rows} | ROIC=${forensics?.roicPct ?? "—"}%, ROIIC=${forensics?.roiicPct ?? "—"}%, SBC/OCF=${forensics?.sbcPctOfOcf ?? "—"}% | ${insider}`;
}

function buildGuidanceAuditPacket(
  notes: readonly ResearchNote[],
  reviews: readonly QuarterlyReview[],
): string {
  const noteLines = notes
    .slice(0, 8)
    .map(
      (n) =>
        `[${n.periodLabel} · ${n.title}] 指标=${n.guidanceMetric || "综合"} 承诺=${n.guidancePromised || "—"} 兑现=${n.guidanceDelivered || "—"} 摘录=${n.content.slice(0, 140)}`,
    );
  const reviewLines = reviews
    .slice(0, 4)
    .map(
      (r) =>
        `[${r.quarterLabel}] 目标价 $${r.baseTargetAtReview} (时价 $${r.priceAtReview}): ${r.summary.slice(0, 120)}`,
    );
  return [...noteLines, ...reviewLines].join("\n") || "暂无持久化多季纪要与指引追踪记录。";
}

function buildPeersPacket(benchmarks: MarketBenchmarkResponse | null | undefined): string {
  if (!benchmarks) return "暂无行业可比与市场一致预期数据。";
  const c = benchmarks.consensus;
  const b = benchmarks.valuationBand;
  const peerStr = benchmarks.peers
    .map(
      (p) =>
        `${p.ticker}(PE=${p.forwardPe ?? "—"}x, 增速=${p.revenueGrowthPct ?? "—"}%, 毛利=${p.grossMarginPct ?? "—"}%, ROIC=${p.roicPct ?? "—"}%)`,
    )
    .join("; ");
  return `一致预期(${c.source}): FY1 Rev=$${c.fy1RevenueB ?? "—"}B, FY1 EPS=$${c.fy1Eps ?? "—"}, FwdPE=${c.impliedForwardPe ?? "—"}x; 历史估值带 P10/P50/P90=${b.p10 ?? "—"}/${b.p50 ?? "—"}/${b.p90 ?? "—"}x (当前分位 ${b.percentileRank ?? "—"}%); 行业同业: ${peerStr}`;
}

function makeReadOnlyTool(description: string, run: () => string) {
  return tool({
    description,
    inputSchema: z.object({ focus: z.string().optional() }),
    execute: async () => run(),
  });
}

function buildSearchTool(
  ctx: AutonomousIcContext,
  push: (toolName: string, label: string, finding: string, citation: string) => string,
) {
  return tool({
    description: "跨语种检索 10-K/10-Q 与多季法说会纪要库，返回带段落坐标的原文证据",
    inputSchema: z.object({ query: z.string().min(2) }),
    execute: async ({ query }) => {
      const hits = searchFilingExcerpts({
        query,
        filings: ctx.cachedFilings,
        researchNotes: ctx.researchNotes,
        sourceText: ctx.sourceText,
        limit: 4,
      });
      const text =
        hits.length > 0
          ? hits.map((h) => `[${h.citation}] ${h.text.slice(0, 220)}`).join("\n")
          : "未检索到匹配段落。";
      return push(
        "agent_search_filings",
        `自主检索原文「${query.slice(0, 18)}」`,
        text,
        hits[0]?.citation ?? `${ctx.thesis.ticker} 资料库`,
      );
    },
  });
}

function buildAutonomousTools(ctx: AutonomousIcContext, traces: AgentTraceStep[], baseIdx: number) {
  let seq = baseIdx;
  const push = (toolName: string, label: string, finding: string, citation: string) => {
    seq += 1;
    traces.push({
      stepIndex: seq,
      toolName,
      label,
      status: "done",
      durationMs: 12,
      finding: finding.slice(0, 260),
      citation,
    });
    return finding;
  };
  return {
    search_primary_filings: buildSearchTool(ctx, push),
    inspect_financial_history: makeReadOnlyTool(
      "调取 5 年完整财报、ROIC/ROIIC、SBC 及 Form 4 内部人交易明细",
      () =>
        push(
          "agent_inspect_financials",
          "自主核查 5 年财报与 Form 4",
          formatFinancialsPacket(ctx.secSnapshot),
          `SEC XBRL & Form 4 · ${ctx.thesis.ticker}`,
        ),
    ),
    audit_guidance_credibility: makeReadOnlyTool(
      "比对管理层多季法说会承诺、指引兑现记录与历史季度复盘",
      () =>
        push(
          "agent_audit_guidance",
          "审计管理层指引兑现轨迹",
          buildGuidanceAuditPacket(ctx.researchNotes ?? [], ctx.reviews ?? []),
          `${ctx.thesis.ticker} 多季纪要库`,
        ),
    ),
    check_peers_and_consensus: makeReadOnlyTool(
      "核对行业真实可比公司估值/ROIC、一致预期及历史估值分位带",
      () =>
        push(
          "agent_check_peers",
          "核对一致预期与行业同业坐标",
          buildPeersPacket(ctx.benchmarks),
          `${ctx.thesis.ticker} 行业同业基准`,
        ),
    ),
  };
}

export function buildFullDossierContext(ctx: AutonomousIcContext): string {
  const hypBlock = ctx.thesis.hypotheses
    .map((h, i) => {
      const kpi = evaluateHypothesisKpi(
        h,
        ctx.secSnapshot?.annuals ?? [],
        ctx.secSnapshot?.quarterlies ?? [],
      );
      return `H${i + 1}[${h.status}] ${h.title} | 指标:${h.metricLabel} 红线:${h.threshold}${kpi ? ` | 自动核验:${kpi.verdictText}` : ""} | 笔记:${h.note.slice(0, 100)}`;
    })
    .join("\n");
  const crossBlock = ctx.thesis.crossChecks
    .slice(0, 6)
    .map(
      (c) =>
        `[${c.peerRole}/${c.alignment}] ${c.peerCompany}(${c.sourceAnchor}): ${c.statement.slice(0, 120)}`,
    )
    .join("\n");
  return [
    `标的：${ctx.thesis.companyName} (${ctx.thesis.ticker}) | 现价 $${ctx.thesis.currentPrice} | 周期 ${ctx.thesis.horizonYears}Y`,
    `核心论点：${ctx.thesis.convictionSummary}`,
    `一致预期观点：${ctx.thesis.businessFilter.consensusView || "未填"} | 我们的预期差：${ctx.thesis.businessFilter.variantPerception || "未填"}`,
    `核心争论：${ctx.thesis.businessFilter.keyDebate || "未填"} | 逆向压力推演：${ctx.thesis.businessFilter.preMortem || "未填"}`,
    `三情景：悲观 $${ctx.thesis.valuation.bear.targetPrice} / 中性 $${ctx.thesis.valuation.base.targetPrice} (CAGR ${ctx.thesis.valuation.base.cagrPct}%) / 乐观 $${ctx.thesis.valuation.bull.targetPrice}`,
    `核心假设：\n${hypBlock}`,
    `产业链互证：\n${crossBlock || "暂无"}`,
    `财务与内部人：${formatFinancialsPacket(ctx.secSnapshot)}`,
    `市场一致预期与同业：${buildPeersPacket(ctx.benchmarks)}`,
  ].join("\n");
}

export async function runAutonomousIcInvestigation(
  model: LanguageModel,
  ctx: AutonomousIcContext,
  startStepIndex: number,
): Promise<{ traces: AgentTraceStep[]; investigationSummary: string }> {
  const traces: AgentTraceStep[] = [];
  const tools = buildAutonomousTools(ctx, traces, startStepIndex);
  try {
    const result = await generateText({
      model,
      tools,
      stopWhen: stepCountIs(4),
      system:
        "你是买方投委会首席研究调查员。在形成结论前，必须主动调用至少 2 个工具核查财报、原文段落、管理层指引兑现或同业基准，严禁臆造任何未返回的数字。最后输出 200 字以内带出处的调查要点。",
      prompt: `请针对 ${ctx.thesis.companyName} (${ctx.thesis.ticker}) 的核心假设与预期差发起深查：\n${buildFullDossierContext(ctx)}`,
    });
    return { traces, investigationSummary: result.text.trim() };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 60) : "工具调研跳过";
    return { traces, investigationSummary: `（自主工具调研回退：${msg}）` };
  }
}
