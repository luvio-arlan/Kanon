import {
  analyzeSecForensics,
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculateResearchReadiness,
  calculateTrueReverseDcf,
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
  const title = topFlag ? `针对「${topFlag.label}」增补离场红线` : "增补高资本开支现金流排雷红线";
  const content = topFlag
    ? `鉴于 ${thesis.ticker} 触发法证提示（${topFlag.label}），若未来两季 Owner FCF 持续弱于净利润且综合毛利率跌破 ${floorGm}%，无条件减半仓复盘。`
    : `鉴于 ${thesis.ticker} CapEx 强度达 ${quality.capexIntensityPct}%，若未来连续两季自由现金流转负且综合毛利率跌破 ${floorGm}%，无条件减半仓复盘。`;
  return {
    id: "prop-sec-forensic-exit",
    target: "exit_rule",
    title,
    beforePreview: thesis.disciplineEntries[0]?.exitRule || "（当前暂无已签署离场红线）",
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
      : "未触发核心法证排雷红灯。";
  const citation = `SEC ${secSnapshot?.cik ?? thesis.ticker} · ${quality.latestFiscalYear} 10-K/Q XBRL`;
  const finding = `${quality.yearsCovered}年画像「${quality.qualityLabel}」：ROIC ${forensics.roicPct ?? "—"}%，Owner FCF 转化 ${forensics.ownerFcfConversionPct ?? "—"}%，SBC/OCF ${forensics.sbcPctOfOcf ?? "—"}%，CapEx 强度 ${quality.capexIntensityPct ?? "—"}%。${flagSummary}`;
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
        title: "补全 18 个月事前验尸（Pre-Mortem）剧本",
        beforePreview: "（当前未填写事前验尸剧本）",
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

function runSupplyChainPeerTool({ thesis }: ResearchToolContext): ResearchToolOutput {
  const divergent = thesis.crossChecks.find((c) => c.alignment === "divergent");
  const citation = `${thesis.ticker} Step 3 上下游产业链互证台账`;
  if (thesis.crossChecks.length < 2) {
    return {
      finding: `当前仅有 ${thesis.crossChecks.length} 条产业链互证记录，样本偏少，存在单一信源偏误风险。`,
      citation,
      proposal: {
        id: "prop-crosscheck-draft",
        target: "cross_check_draft",
        title: "增补关键上游/客户口径交叉验证条目",
        beforePreview: `当前共 ${thesis.crossChecks.length} 条产业链互证`,
        content: `核查 ${thesis.companyName} 核心上游供应商或头部云客户最新季报 CapEx 与库存指引，对照管理层在电话会中的需求表态。`,
        rationale: "买方研究至少需 2 条以上独立产业链信源交叉印证，方能排除管理层乐观偏差。",
        citation,
        meta: {
          peerCompany: "核心上下游伙伴（待填）",
          peerRole: "upstream",
          topic: "CapEx 与需求能见度",
        },
      },
    };
  }
  if (divergent) {
    const watchIdx = thesis.hypotheses.findIndex((h) => h.status !== "warning");
    const targetIdx = Math.max(watchIdx, 0);
    const target = thesis.hypotheses[targetIdx];
    return {
      finding: `检测到与「${divergent.peerCompany}」在「${divergent.topic}」存在口径分歧：${divergent.takeaway}`,
      citation: `产业链分歧 · ${divergent.peerCompany} (${divergent.sourceAnchor})`,
      proposal: target
        ? {
            id: "prop-hyp-warning",
            target: "hypothesis_update",
            title: `将假设 0${targetIdx + 1} 标记为预警并追加分歧证据`,
            beforePreview: `[${target.status}] ${target.note}`,
            content: `${target.note} [产业链分歧核验：${divergent.peerCompany} 在 ${divergent.topic} 提示「${divergent.takeaway}」，需下季重点复核]`,
            rationale: "上下游出现实质性口径背离时，应前置下调假设置信度而非被动等待财报暴雷。",
            citation: `${divergent.peerCompany} · ${divergent.sourceAnchor}`,
            meta: { hypothesisIndex: targetIdx, hypothesisStatus: "warning" },
          }
        : undefined,
    };
  }
  return {
    finding: `已沉淀 ${thesis.crossChecks.length} 条产业链交叉验证且口径整体一致，支撑核心投资假设。`,
    citation,
  };
}

function runPortfolioDisciplineTool({ thesis }: ResearchToolContext): ResearchToolOutput {
  const overCap = thesis.currentWeightPct > thesis.targetMaxWeightPct;
  const hasDisc = thesis.disciplineEntries.length > 0;
  const finding = `仓位角色「${thesis.portfolioRole}」：当前权重 ${thesis.currentWeightPct}% / 上限 ${thesis.targetMaxWeightPct}%${overCap ? "（已超个人上限！）" : ""}；已签零杠杆纪律卡 ${thesis.disciplineEntries.length} 次。`;
  return {
    finding,
    citation: `${thesis.ticker} 资金配置与零杠杆交易纪律台账`,
    proposal: !hasDisc
      ? {
          id: "prop-first-discipline",
          target: "exit_rule",
          title: "在建仓前预置首条零杠杆离场红线",
          beforePreview: "（尚未签署交易纪律卡）",
          content: `严守零杠杆与单票 ${thesis.targetMaxWeightPct}% 仓位上限；若核心假设 01 连续两季失守阈值，无条件减仓复盘。`,
          rationale: "先写退出条件再投入本金，是控制永久性本金损失的底线。",
          citation: `${thesis.ticker} Step 5 零杠杆铁律`,
        }
      : undefined,
  };
}

export const RESEARCH_AGENT_TOOLS: readonly ResearchToolSpec[] = [
  {
    name: "inspect_sec_forensics",
    label: "核验 SEC 14 项法证质量、ROIC 与 SBC 排雷",
    description: "Run deterministic SEC forensic accounting & SBC/working-capital red-flag checks.",
    execute: runForensicsTool,
  },
  {
    name: "stress_test_reverse_dcf",
    label: "运行真·反向折现现金流与安全买点压力测试",
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
    execute: runPortfolioDisciplineTool,
  },
];
