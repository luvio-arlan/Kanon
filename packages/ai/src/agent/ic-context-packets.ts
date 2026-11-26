import {
  analyzeSecForensics,
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculateResearchReadiness,
  evaluateHypothesisKpi,
  type MarketBenchmarkResponse,
  type QuarterlyReview,
  type ResearchNote,
  type SecFilingReaderResponse,
  type SecSnapshot,
  type ThesisDetail,
} from "@kanon/core";
import { wrapUntrustedEvidence } from "../copilot/safe-provider-fetch";
import type { LlmProposalDraft } from "./proposal-grounding";
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

export interface LocalIcSynthesis {
  verdict: string;
  bullSynthesis: string;
  bearCritique: string;
  bearRebuttal: string;
  accountingCheck: string;
  customProposals: LlmProposalDraft[];
}

export function formatFinancialsPacket(sec: SecSnapshot | null): string {
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

export function buildGuidanceAuditPacket(
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
  const combined = [...noteLines, ...reviewLines].join("\n");
  return combined
    ? wrapUntrustedEvidence("管理层多季纪要与复盘", combined)
    : "暂无持久化多季纪要与指引追踪记录。";
}

function formatConsensusSummary(benchmarks: MarketBenchmarkResponse): string {
  const c = benchmarks.consensus;
  const base =
    c.source === "live-market"
      ? `卖方一致预期(live-market): FY1 Rev=$${c.fy1RevenueB ?? "—"}B, FY1 EPS=$${c.fy1Eps ?? "—"}, FwdPE=${c.impliedForwardPe ?? "—"}x`
      : "卖方一致预期: 未接入外部预期数据源";
  const ext = benchmarks.historicalExtrapolation;
  if (!ext) return base;
  return `${base}; 历史财报外推(非一致预期): CAGR=${ext.revenueCagrPct ?? "—"}%, 外推FY1 EPS=$${ext.extrapolatedFy1Eps ?? "—"}`;
}

function formatBandSummary(benchmarks: MarketBenchmarkResponse): string {
  const b = benchmarks.valuationBand;
  if (b) {
    return `历史估值分位带 P10/P50/P90=${b.p10 ?? "—"}/${b.p50 ?? "—"}/${b.p90 ?? "—"}x (当前分位 ${b.percentileRank ?? "—"}%)`;
  }
  const range = benchmarks.peerMultipleRange;
  if (range) {
    return `同业当前倍数区间(${range.sampleSize}家) Min/Med/Max=${range.min ?? "—"}/${range.median ?? "—"}/${range.max ?? "—"}x`;
  }
  return "历史估值分位带: 暂无(待接入日频价格历史)";
}

function formatPeerRowBrief(p: MarketBenchmarkResponse["peers"][number]): string {
  return `${p.ticker}(PE=${p.forwardPe ?? "—"}x, 增速=${p.revenueGrowthPct ?? "—"}%, 毛利=${p.grossMarginPct ?? "—"}%, ROIC=${p.roicPct ?? "—"}%)`;
}

export function buildPeersPacket(benchmarks: MarketBenchmarkResponse | null | undefined): string {
  if (!benchmarks) return "暂无行业可比与外部预期数据。";
  const peerStr =
    benchmarks.peers.length > 0
      ? benchmarks.peers.map(formatPeerRowBrief).join("; ")
      : "未收录同业图谱";
  return `${formatConsensusSummary(benchmarks)}; ${formatBandSummary(benchmarks)}; 行业同业: ${peerStr}`;
}

export function buildFullDossierContext(
  ctx: AutonomousIcContext,
  options?: { includePackets?: boolean },
): string {
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
  const baseLines = [
    `标的：${ctx.thesis.companyName} (${ctx.thesis.ticker}) | 现价 $${ctx.thesis.currentPrice} | 周期 ${ctx.thesis.horizonYears}Y`,
    `核心论点：${ctx.thesis.convictionSummary}`,
    `一致预期观点：${ctx.thesis.businessFilter.consensusView || "未填"} | 我们的预期差：${ctx.thesis.businessFilter.variantPerception || "未填"}`,
    `核心争论：${ctx.thesis.businessFilter.keyDebate || "未填"} | 逆向压力推演：${ctx.thesis.businessFilter.preMortem || "未填"}`,
    `三情景：悲观 $${ctx.thesis.valuation.bear.targetPrice} / 中性 $${ctx.thesis.valuation.base.targetPrice} (CAGR ${ctx.thesis.valuation.base.cagrPct}%) / 乐观 $${ctx.thesis.valuation.bull.targetPrice}`,
    `核心假设：\n${hypBlock}`,
    crossBlock ? wrapUntrustedEvidence("产业链互证", crossBlock) : "产业链互证：暂无",
  ];
  if (options?.includePackets === false) return baseLines.join("\n");
  return [
    ...baseLines,
    `财务与内部人：${formatFinancialsPacket(ctx.secSnapshot)}`,
    `行业同业与外部预期：${buildPeersPacket(ctx.benchmarks)}`,
  ].join("\n");
}

export function computeConvictionScore(
  thesis: ThesisDetail,
  secSnapshot: SecSnapshot | null,
): number {
  const readiness = calculateResearchReadiness(thesis);
  const exp = calculateImpliedExpectations({ summary: thesis.valuation });
  const quality = analyzeSecQuality(secSnapshot?.annuals ?? []);
  const forensics = analyzeSecForensics(secSnapshot?.annuals ?? [], secSnapshot?.quarterlies ?? []);
  let score = Math.round(readiness.scorePct * 0.42);
  if (thesis.valuation.convictionZone === "attractive") score += 24;
  else if (thesis.valuation.convictionZone === "balanced") score += 15;
  else score += 6;
  if (exp.isBelowHurdle15) score += 12;
  if (quality?.qualityGrade === "compounder") score += 12;
  else if (quality) score += 7;
  if (thesis.businessFilter.variantPerception.trim().length >= 10) score += 6;
  if (forensics && forensics.redFlags.length > 0) {
    score -= Math.min(12, forensics.redFlags.length * 4);
  }
  return Math.min(98, Math.max(18, score));
}

export function buildLocalSynthesis(
  thesis: ThesisDetail,
  traces: readonly AgentTraceStep[],
): LocalIcSynthesis {
  const ratio =
    thesis.valuation.riskRewardRatio !== null
      ? `${thesis.valuation.riskRewardRatio.toFixed(2)}×`
      : "∞";
  const verdict =
    thesis.valuation.convictionZone === "attractive"
      ? `具备显著赔率不对称（${ratio}），建议围绕核心假设红线严守零杠杆跟踪`
      : thesis.valuation.convictionZone === "balanced"
        ? `当前赔率处于均衡区间（${ratio}），建议耐心等待更好安全边际或核心争论明朗`
        : `当前估值偏紧（${ratio}），不具备足够安全边际，严禁情绪化追高`;
  const h0 = thesis.hypotheses[0];
  const hLast = thesis.hypotheses[thesis.hypotheses.length - 1] ?? h0;
  return {
    verdict,
    bullSynthesis:
      thesis.businessFilter.variantPerception.trim() ||
      `${thesis.companyName} 核心驱动在于「${h0?.title ?? thesis.convictionSummary}」，中性目标 $${thesis.valuation.base.targetPrice.toFixed(1)}（年化 ${thesis.valuation.base.cagrPct.toFixed(1)}%）。`,
    bearCritique:
      thesis.businessFilter.preMortem.trim() ||
      `最大下行风险来自「${hLast?.title ?? "核心盈利假设"}」证伪叠加估值回落至 ${thesis.valuation.bear.peMultiple}x（回撤 ${thesis.valuation.downsidePct.toFixed(1)}%）。`,
    bearRebuttal: `空头二次质询：若「${h0?.title ?? "核心看多预期差"}」在未来 2 个季度未能于毛利率或订单口径兑现，当前 $${thesis.currentPrice.toFixed(1)} 对应的隐含增速将迅速重定价，建议提前写明硬性止损验证指标。`,
    accountingCheck: traces[0]?.finding ?? "暂缺多年度 SEC 现金流数据，建议先执行同步。",
    customProposals: [],
  };
}
