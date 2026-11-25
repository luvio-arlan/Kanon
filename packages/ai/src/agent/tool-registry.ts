import {
  analyzeSecForensics,
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculateResearchReadiness,
  calculateTrueReverseDcf,
  type MarketBenchmarkResponse,
  type MarketQuoteSnapshot,
  type QuarterlyReview,
  type ResearchNote,
  type SecFilingReaderResponse,
  type SecSnapshot,
  type ThesisDetail,
  type ThesisRevision,
} from "@kanon/core";
import { runPortfolioDisciplineTool, runQuarterlyDriftTool } from "./drift-audit-tool";
import { runFilingExcerptsTool } from "./filing-search-tool";
import {
  runCatalystValueTrapTool,
  runLiveMarketRegimeTool,
  runSupplyChainPeerTool,
} from "./market-catalyst-tools";
import type { AgentProposal, ResearchToolOutput } from "./types";

export interface ResearchToolContext {
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
  reviews?: readonly QuarterlyReview[];
  revisions?: readonly ThesisRevision[];
  marketQuote?: MarketQuoteSnapshot | null;
  cachedFilings?: readonly SecFilingReaderResponse[];
  researchNotes?: readonly ResearchNote[];
  benchmarks?: MarketBenchmarkResponse | null;
  sourceText?: string;
}

export interface ResearchToolSpec {
  name: string;
  label: string;
  description: string;
  execute: (ctx: ResearchToolContext) => ResearchToolOutput;
}

function buildForensicProposal(
  thesis: ThesisDetail,
  quality: NonNullable<ReturnType<typeof analyzeSecQuality>>,
  forensics: NonNullable<ReturnType<typeof analyzeSecForensics>>,
  citation: string,
): AgentProposal | undefined {
  const topFlag = forensics.redFlags[0];
  const highCapex = (quality.capexIntensityPct ?? 0) >= 22;
  if (!topFlag && !highCapex) return undefined;
  const floorGm = Math.max(20, (quality.latestGrossMarginPct ?? 40) - 5).toFixed(0);
  const title = topFlag ? `针对「${topFlag.label}」增补离场条件` : "增补高资本开支现金流风控条件";
  const content = topFlag
    ? `鉴于 ${thesis.ticker} 触发法证提示（${topFlag.label}），若未来两季 Owner FCF 持续弱于净利润且综合毛利率跌破 ${floorGm}%，无条件减半仓复盘。`
    : `鉴于 ${thesis.ticker} CapEx 强度达 ${quality.capexIntensityPct}%，若未来连续两季自由现金流转负且综合毛利率跌破 ${floorGm}%，无条件减半仓复盘。`;
  return {
    id: "prop-sec-forensic-exit",
    target: "exit_rule",
    title,
    beforePreview: thesis.disciplineEntries[0]?.exitRule || "（当前暂无已签署离场条件）",
    content,
    rationale: topFlag?.detail ?? "重资本扩产周期中，毛利率与 FCF 同步失守往往领先盈利下修。",
    citation,
  };
}

function runForensicsTool({ thesis, secSnapshot }: ResearchToolContext): ResearchToolOutput {
  const annuals = secSnapshot?.annuals ?? [];
  const quality = analyzeSecQuality(annuals);
  const forensics = analyzeSecForensics(annuals, secSnapshot?.quarterlies ?? []);
  if (!quality || !forensics) {
    return {
      finding: `尚未同步 ${thesis.ticker} 的多年度 SEC 10-K 财务数据，建议先在 Step 3 同步 XBRL 事实。`,
      citation: `SEC EDGAR · ${thesis.ticker}（待拉取）`,
    };
  }
  const flagSummary =
    forensics.redFlags.length > 0
      ? `触发 ${forensics.redFlags.length} 项法证提醒（${forensics.redFlags.map((f) => f.label).join("、")}）。`
      : "未触发核心财务法证警示。";
  const citation = `SEC ${secSnapshot?.cik ?? thesis.ticker} · ${quality.latestFiscalYear} 10-K/Q XBRL`;
  const finding = `${quality.yearsCovered}年画像「${quality.qualityLabel}」· 法证 ${forensics.forensicScore}分(${forensics.forensicGradeLabel})：ROIC ${forensics.roicPct ?? "—"}%，ROIIC ${forensics.roiicPct ?? "—"}%，Rule of 40 ${forensics.ruleOf40Score ?? "—"}，Sloan 应计 ${forensics.sloanAccrualPct ?? "—"}%，SBC/OCF ${forensics.sbcPctOfOcf ?? "—"}%。${flagSummary}`;
  return {
    finding,
    citation,
    proposal: buildForensicProposal(thesis, quality, forensics, citation),
  };
}

function runReverseDcfTool({ thesis, secSnapshot }: ResearchToolContext): ResearchToolOutput {
  const quality = analyzeSecQuality(secSnapshot?.annuals ?? []);
  const exp = calculateImpliedExpectations({
    summary: thesis.valuation,
    trailingEps: quality?.latestEps,
  });
  const rdcf = calculateTrueReverseDcf({
    currentPrice: thesis.currentPrice,
    baseMetricPerShare:
      quality?.latestEps && quality.latestEps > 0 ? quality.latestEps : thesis.currentPrice / 22,
    horizonYears: Math.max(3, thesis.horizonYears),
    hurdleRatePct: 15,
    terminalMultiple: thesis.valuation.base.peMultiple,
    historicalCagrPct: quality?.revenueCagrPct ?? null,
  });
  const finding = `相对中性安全边际 ${exp.marginOfSafetyPct}%，15% 买点 $${exp.hurdleEntry15.toFixed(1)}；反向 DCF 测算现价隐含未来必须达成 ${rdcf.requiredCagrPct}% 复合增速${rdcf.expectationsGapPct !== null ? `（相对历史增速预期差 ${rdcf.expectationsGapPct > 0 ? "+" : ""}${rdcf.expectationsGapPct}pct）` : ""}。`;
  const citation = `${thesis.ticker} Reverse-DCF & ${thesis.horizonYears}Y 三情景锚点`;
  const h0Title = thesis.hypotheses[0]?.title ?? "核心增长假设";
  const proposal: AgentProposal | undefined = !thesis.businessFilter.preMortem.trim()
    ? {
        id: "prop-premortem",
        target: "pre_mortem",
        title: "补全 18 个月逆向压力推演",
        beforePreview: "（当前未填写逆向压力推演）",
        content: `假设 18 个月后 ${thesis.companyName} 股价回撤 ${Math.max(25, Math.round(thesis.valuation.downsidePct + 15))}%：核心原因很可能是「${h0Title}」失速且未能达成市场隐含的 ${rdcf.requiredCagrPct}% 增速，估值压缩至悲观 ${thesis.valuation.bear.peMultiple}x（$${thesis.valuation.bear.targetPrice.toFixed(1)}）。`,
        rationale: "机构级风控要求建仓前先写清失败链条，对抗确认偏误。",
        citation,
      }
    : undefined;
  return { finding, citation, proposal };
}

function runHypothesisAuditTool({ thesis }: ResearchToolContext): ResearchToolOutput {
  const readiness = calculateResearchReadiness(thesis);
  const warnings = thesis.hypotheses.filter((h) => h.status === "warning");
  const divergent = thesis.crossChecks.filter((c) => c.alignment === "divergent");
  const missingVariant = !thesis.businessFilter.variantPerception.trim();
  const h0 = thesis.hypotheses[0];
  const targetHyp = warnings[0] ?? thesis.hypotheses[thesis.hypotheses.length - 1] ?? h0;
  const citation = `${thesis.ticker} ${thesis.hypotheses.length} 条核心假设 & ${thesis.crossChecks.length} 条产业链互证`;
  const finding = `研究成熟度 ${readiness.completedCount}/5（${readiness.scorePct}%）；存在 ${warnings.length} 条预警假设、${divergent.length} 条产业链分歧${missingVariant ? "，尚缺明确预期差陈述" : "，已建立预期差框架"}。`;

  const proposal: AgentProposal = missingVariant
    ? {
        id: "prop-variant",
        target: "variant_perception",
        title: "凝练买方核心预期差（Variant Perception）",
        beforePreview: "（当前未填写预期差）",
        content: `市场当前过度关注短期波动，但若「${h0?.title ?? thesis.convictionSummary}」持续兑现（${h0?.threshold ?? "核心红线"}），${thesis.companyName} 盈利中枢将系统性高于一致预期。`,
        rationale: "清晰界定“市场错在哪”是超额收益的真正来源。",
        citation,
      }
    : {
        id: "prop-debate",
        target: "key_debate",
        title: "聚焦未来 18 个月唯一核心争论",
        beforePreview: thesis.businessFilter.keyDebate.trim() || "（当前未填写核心争论）",
        content: `核心多空分歧集中在「${targetHyp?.title ?? "核心前提"}」能否守住 ${targetHyp?.threshold ?? "关键红线"}，建议下一季财报优先核验 ${targetHyp?.metricLabel ?? "核心指标"}。`,
        rationale: "聚焦决定估值重估的唯一胜负手，而非面面俱到。",
        citation,
      };
  return { finding, citation, proposal };
}

export const RESEARCH_AGENT_TOOLS: readonly ResearchToolSpec[] = [
  {
    name: "inspect_sec_forensics",
    label: "核验 SEC 法证评分、ROIC/ROIIC 与 SBC 稀释风险",
    description: "Run deterministic SEC forensic accounting & SBC/working-capital red-flag checks.",
    execute: runForensicsTool,
  },
  {
    name: "stress_test_reverse_dcf",
    label: "运行反向折现现金流（Reverse-DCF）与安全买点压力测试",
    description: "Run Reverse-DCF implied growth solver and 15%/20% hurdle entry analysis.",
    execute: runReverseDcfTool,
  },
  {
    name: "audit_thesis_blindspots",
    label: "审计假设成熟度、核心预期差与盲区",
    description: "Audit falsifiability and buy-side variant perception scaffolding.",
    execute: runHypothesisAuditTool,
  },
  {
    name: "audit_supply_chain_peers",
    label: "交叉审计上下游产业链口径分歧",
    description: "Scan cross-check alignments and flag peer divergence against hypotheses.",
    execute: runSupplyChainPeerTool,
  },
  {
    name: "check_portfolio_discipline",
    label: "复核仓位上限与零杠杆交易纪律覆盖",
    description: "Verify position weight vs cap and zero-leverage discipline coverage.",
    execute: (ctx) => runPortfolioDisciplineTool(ctx.thesis),
  },
  {
    name: "audit_quarterly_drift",
    label: "扫描季度财报复盘与估值锚点漂移轨迹",
    description: "Audit quarterly hypothesis verdicts and cross-quarter target price drift.",
    execute: (ctx) =>
      runQuarterlyDriftTool({
        thesis: ctx.thesis,
        reviews: ctx.reviews ?? [],
        revisions: ctx.revisions ?? [],
      }),
  },
  {
    name: "analyze_live_market_regime",
    label: "对照实时盘前/盘后报价与 52 周分位校准买点",
    description: "Compare live extended-hours price and 52W percentile against 15% buy hurdle.",
    execute: (ctx) => runLiveMarketRegimeTool(ctx.thesis, ctx.marketQuote),
  },
  {
    name: "audit_catalyst_and_value_trap",
    label: "审计催化剂日程与价值陷阱核查",
    description:
      "Check upcoming hard/soft catalysts to prevent value traps without rerating events.",
    execute: (ctx) => runCatalystValueTrapTool(ctx.thesis),
  },
  {
    name: "search_sec_filing_excerpts",
    label: "BM25 检索 10-K/10-Q 与电话会一阶原文证据",
    description:
      "Retrieve grounded paragraphs from cached SEC filings and call transcripts matching core hypotheses.",
    execute: (ctx) =>
      runFilingExcerptsTool({
        thesis: ctx.thesis,
        cachedFilings: ctx.cachedFilings,
        researchNotes: ctx.researchNotes,
        sourceText: ctx.sourceText,
      }),
  },
];
