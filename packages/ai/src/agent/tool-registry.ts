import {
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type SecSnapshot,
  type ThesisDetail,
} from "@kanon/core";
import type { AgentProposal } from "./types";

export interface ResearchToolContext {
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
}

export interface ResearchToolOutput {
  finding: string;
  citation: string;
  proposal?: AgentProposal;
}

export interface ResearchToolSpec {
  name: string;
  label: string;
  description: string;
  execute: (ctx: ResearchToolContext) => ResearchToolOutput;
}

type SecQuality = NonNullable<ReturnType<typeof analyzeSecQuality>>;

function formatSecMarginText(quality: SecQuality): string {
  if (quality.grossMarginDeltaBps === null) {
    return `均值毛利率 ${quality.avgGrossMarginPct ?? "—"}%`;
  }
  const sign = quality.grossMarginDeltaBps > 0 ? "+" : "";
  return `毛利率较初期变动 ${sign}${quality.grossMarginDeltaBps}bps`;
}

function buildCapexProposal(
  ticker: string,
  quality: SecQuality,
  citation: string,
): AgentProposal | undefined {
  if ((quality.capexIntensityPct ?? 0) < 22) return undefined;
  const floorGm = Math.max(20, (quality.latestGrossMarginPct ?? 40) - 5).toFixed(0);
  return {
    id: "prop-sec-capex",
    target: "exit_rule",
    title: "增补高资本开支现金流排雷红线",
    content: `鉴于 ${ticker} CapEx 强度达 ${quality.capexIntensityPct}%，若未来连续两季自由现金流转负且综合毛利率跌破 ${floorGm}%，无条件减半仓复盘。`,
    rationale: "重资本扩产周期中，毛利率与 FCF 同步失守往往领先盈利下修 1–2 个季度。",
    citation,
  };
}

function runSecTool({ thesis, secSnapshot }: ResearchToolContext): ResearchToolOutput {
  const quality = analyzeSecQuality(secSnapshot?.annuals ?? []);
  if (!quality) {
    return {
      finding: `尚未同步 ${thesis.ticker} 的多年度 SEC 10-K 财务数据，建议先在 Step 3 同步 XBRL 事实。`,
      citation: `SEC EDGAR · ${thesis.ticker}（待拉取）`,
    };
  }
  const marginText = formatSecMarginText(quality);
  const finding = `${quality.yearsCovered}年画像「${quality.qualityLabel}」：营收 CAGR ${quality.revenueCagrPct ?? "—"}%，${marginText}，FCF 转化率 ${quality.fcfConversionPct ?? "—"}%，CapEx 强度 ${quality.capexIntensityPct ?? "—"}%。`;
  const citation = `SEC ${secSnapshot?.cik ?? thesis.ticker} · ${quality.latestFiscalYear} 10-K/20-F XBRL`;
  return {
    finding,
    citation,
    proposal: buildCapexProposal(thesis.ticker, quality, citation),
  };
}

function runExpectationsTool({ thesis, secSnapshot }: ResearchToolContext): ResearchToolOutput {
  const quality = analyzeSecQuality(secSnapshot?.annuals ?? []);
  const exp = calculateImpliedExpectations({
    summary: thesis.valuation,
    trailingEps: quality?.latestEps,
  });
  const gapLine =
    exp.impliedEpsCagrPct !== null && exp.baseEpsCagrPct !== null
      ? `市场现价隐含 EPS 增速 ${exp.impliedEpsCagrPct}% vs 你的中性预测 ${exp.baseEpsCagrPct}%（预期差 ${exp.expectationsGapPct}pct）。`
      : `按中性 PE 折算，当前价已隐含远期 EPS $${exp.impliedEpsAtBasePe.toFixed(2)}。`;
  const finding = `相对中性目标安全边际 ${exp.marginOfSafetyPct}%，15% 年化买点 $${exp.hurdleEntry15.toFixed(1)}（当前${exp.isBelowHurdle15 ? "已处于买点区间内" : "高于买点"}）。${gapLine}`;
  const citation = `${thesis.ticker} 反向估值模型 · ${thesis.horizonYears}Y 三情景锚点`;
  const h0Title = thesis.hypotheses[0]?.title ?? "核心增长假设";
  const proposal: AgentProposal | undefined = !thesis.businessFilter.preMortem.trim()
    ? {
        id: "prop-premortem",
        target: "pre_mortem",
        title: "补全 18 个月事前验尸（Pre-Mortem）剧本",
        content: `假设 18 个月后 ${thesis.companyName} 股价回撤 ${Math.max(25, Math.round(thesis.valuation.downsidePct + 15))}%：核心原因很可能是「${h0Title}」不及预期，叠加估值压缩至悲观情景 ${thesis.valuation.bear.peMultiple}x（$${thesis.valuation.bear.targetPrice.toFixed(1)}）。`,
        rationale: "机构级风控要求在建仓前先写下失败叙事，避免确认偏误。",
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
  const finding = `研究成熟度 ${readiness.completedCount}/5（${readiness.scorePct}%）；存在 ${warnings.length} 条预警假设、${divergent.length} 条产业链口径分歧${missingVariant ? "，尚缺明确「预期差」陈述" : "，已建立预期差框架"}。`;
  const citation = `${thesis.ticker} 核心假设台账 & ${thesis.crossChecks.length} 条产业链互证`;
  const h0 = thesis.hypotheses[0];
  const targetHyp = warnings[0] ?? thesis.hypotheses[thesis.hypotheses.length - 1] ?? h0;
  const proposal: AgentProposal = missingVariant
    ? {
        id: "prop-variant",
        target: "variant_perception",
        title: "凝练买方核心预期差（Variant Perception）",
        content: `市场当前过度关注短期波动，但若「${h0?.title ?? thesis.convictionSummary}」持续兑现（${h0?.threshold ?? "核心红线"}），${thesis.companyName} 盈利中枢将系统性高于一致预期。`,
        rationale: "没有清晰预期差的看多逻辑只是跟随共识，难以建立超额收益底气。",
        citation,
      }
    : {
        id: "prop-debate",
        target: "key_debate",
        title: "聚焦未来 18 个月唯一核心争论",
        content: `核心多空分歧集中在「${targetHyp?.title ?? "核心盈利前提"}」能否守住 ${targetHyp?.threshold ?? "关键红线"}，建议下一季财报优先核验 ${targetHyp?.metricLabel ?? "核心财务指标"}。`,
        rationale: "将研究精力聚焦于决定估值重估的 1 个核心胜负手，而非面面俱到。",
        citation,
      };
  return { finding, citation, proposal };
}

export const RESEARCH_AGENT_TOOLS: readonly ResearchToolSpec[] = [
  {
    name: "inspect_sec_fundamentals",
    label: "核验 SEC 多年度基本面与现金流质量",
    description:
      "Read deterministic SEC XBRL multi-year quality metrics and detect cash-flow/CapEx risk.",
    execute: runSecTool,
  },
  {
    name: "stress_test_expectations",
    label: "运行反向估值预期与安全买点压力测试",
    description: "Run Reverse-DCF implied market EPS CAGR and 15%/20% hurdle entry analysis.",
    execute: runExpectationsTool,
  },
  {
    name: "audit_thesis_blindspots",
    label: "审计假设脆弱度、预期差与产业链分歧",
    description: "Audit falsifiability, cross-check divergence, and missing buy-side scaffolding.",
    execute: runHypothesisAuditTool,
  },
];
