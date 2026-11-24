import {
  calculateImpliedExpectations,
  type MarketQuoteSnapshot,
  roundTo,
  type ThesisDetail,
} from "@kanon/core";
import type { ResearchToolOutput } from "./types";

const SESSION_CN = {
  PRE: "盘前",
  REGULAR: "盘中",
  POST: "盘后",
  CLOSED: "休市",
} as const;

export function runLiveMarketRegimeTool(
  thesis: ThesisDetail,
  quote: MarketQuoteSnapshot | null | undefined,
): ResearchToolOutput {
  const exp = calculateImpliedExpectations({ summary: thesis.valuation });
  if (!quote) {
    return {
      finding: `当前基于档案参考价 $${thesis.currentPrice.toFixed(2)} 核算（距 15% 安全买点 $${exp.hurdleEntry15.toFixed(1)} 偏离 ${roundTo(((thesis.currentPrice - exp.hurdleEntry15) / exp.hurdleEntry15) * 100, 1)}%），实时盘前/盘后通道离线。`,
      citation: `${thesis.ticker} 档案估值锚点`,
    };
  }
  const live = quote.effectivePrice;
  const dist15Pct = roundTo(((live - exp.hurdleEntry15) / exp.hurdleEntry15) * 100, 1);
  const extNote =
    quote.sessionState === "PRE" && quote.preMarketPrice !== null
      ? `盘前 $${quote.preMarketPrice.toFixed(2)} (${quote.preMarketChangePct ?? 0}%)`
      : quote.sessionState === "POST" && quote.postMarketPrice !== null
        ? `盘后 $${quote.postMarketPrice.toFixed(2)} (${quote.postMarketChangePct ?? 0}%)`
        : `${SESSION_CN[quote.sessionState]} $${quote.regularPrice.toFixed(2)}`;
  const range52 =
    quote.fiftyTwoWeekPositionPct !== null
      ? `，处于 52 周区间 ${quote.fiftyTwoWeekPositionPct.toFixed(0)}% 分位`
      : "";
  const zoneCue =
    live <= exp.hurdleEntry15
      ? "已落入 15% 年化安全买点带内"
      : `高于 15% 安全买点 ${dist15Pct > 0 ? `+${dist15Pct}` : dist15Pct}%`;

  return {
    finding: `实时行情（${quote.source.toUpperCase()}）${extNote}${range52}；相对 15% 买点 $${exp.hurdleEntry15.toFixed(1)}，${zoneCue}。`,
    citation: `${quote.source.toUpperCase()} ${SESSION_CN[quote.sessionState]} · ${thesis.ticker}`,
  };
}

export function runCatalystValueTrapTool(thesis: ThesisDetail): ResearchToolOutput {
  const upcoming = thesis.catalysts.filter((c) => c.status === "upcoming");
  const highImpact = upcoming.filter((c) => c.impact === "high");
  const exp = calculateImpliedExpectations({ summary: thesis.valuation });
  const citation = `${thesis.ticker} 催化剂日程台账（共 ${thesis.catalysts.length} 项）`;

  if (upcoming.length === 0) {
    const trapWarning =
      exp.marginOfSafetyPct >= 20
        ? "高安全边际却缺少催化剂是典型「价值陷阱」前兆"
        : "缺少可观测重估事件锚点";
    const h0 = thesis.hypotheses[0];
    return {
      finding: `当前尚未设定待验证催化剂（0 项），${trapWarning}。`,
      citation,
      proposal: {
        id: "prop-catalyst-draft",
        target: "catalyst_draft",
        title: `增补下一季财报关键重估催化剂（${thesis.ticker}）`,
        beforePreview: "当前待验证催化剂 0 项",
        content: `下一季财报电话会核验「${h0?.title ?? thesis.convictionSummary}」是否突破红线（${h0?.threshold ?? "核心指标"}），驱动市场预期修正。`,
        rationale: "Mauboussin 预期差框架要求明确缩小价格与价值缺口的具体催化节点，规避长期死钱。",
        citation,
        meta: {
          catalystCategory: "earnings",
          catalystDateLabel: "下一季财报",
          catalystMetric: h0?.metricLabel ?? "核心营收与毛利率指引",
        },
      },
    };
  }

  const next = highImpact[0] ?? upcoming[0];
  return {
    finding: `已追踪 ${upcoming.length} 项待验证催化剂（高影响 ${highImpact.length} 项）；最近核心事件为「${next?.dateLabel} · ${next?.title}」，验证口径：${next?.verificationMetric}。`,
    citation,
  };
}

function buildDivergentPeerProposal(
  thesis: ThesisDetail,
  divergent: ThesisDetail["crossChecks"][number],
): ResearchToolOutput {
  const targetIdx = Math.max(
    thesis.hypotheses.findIndex((h) => h.status !== "warning"),
    0,
  );
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

export function runSupplyChainPeerTool({ thesis }: { thesis: ThesisDetail }): ResearchToolOutput {
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
  if (divergent) return buildDivergentPeerProposal(thesis, divergent);
  return {
    finding: `已沉淀 ${thesis.crossChecks.length} 条产业链交叉验证且口径整体一致，支撑核心投资假设。`,
    citation,
  };
}
