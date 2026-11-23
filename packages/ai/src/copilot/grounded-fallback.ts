import type { SecSnapshot, ThesisDetail } from "@kanon/core";
import {
  type EarningsDigest,
  EarningsDigestSchema,
  type RedTeamReport,
  RedTeamReportSchema,
  type VideoScript,
  VideoScriptSchema,
} from "../schemas/copilot";

export function buildGroundedEarningsDigest(
  thesis: ThesisDetail,
  secSnapshot: SecSnapshot | null,
): EarningsDigest {
  const latestFiling = secSnapshot?.filings[0];
  const anchor = latestFiling
    ? `${thesis.ticker} ${latestFiling.form} (${latestFiling.filingDate})`
    : `${thesis.ticker} 季度电话会与一阶档案`;
  const factLine = secSnapshot?.facts[0]
    ? `${secSnapshot.facts[0].label} ${secSnapshot.facts[0].valueFormatted}（${secSnapshot.facts[0].period} · ${secSnapshot.facts[0].sourceTag}）`
    : `${thesis.companyName} 核心经营指标已锚定当前参考价 $${thesis.currentPrice.toFixed(2)}`;

  return EarningsDigestSchema.parse({
    ticker: thesis.ticker,
    quarterLabel: latestFiling
      ? `${latestFiling.form} · ${latestFiling.filingDate}`
      : "最新季度跟踪",
    guidanceSummary: `${thesis.companyName}（${thesis.ticker}）当前核心跟踪主线：${thesis.convictionSummary} 一阶事实锚点：${factLine}。`,
    capexSignals: [
      `围绕「${thesis.hypotheses[0].metricLabel}」核对管理层最新指引是否守住 ${thesis.hypotheses[0].threshold}。`,
      thesis.crossChecks[0]
        ? `产业链互证（${thesis.crossChecks[0].peerCompany}）：${thesis.crossChecks[0].takeaway}`
        : "建议在 Step 3 补充至少 1 家上下游核心伙伴的 CapEx 口径对照。",
    ],
    toneShifts: [
      `核心假设「${thesis.hypotheses[2].title}」当前处于 ${thesis.hypotheses[2].status === "warning" ? "证伪预警" : "持续观察"} 状态，需重点追踪管理层措辞是否转趋谨慎。`,
      `中性目标价 $${thesis.valuation.base.targetPrice.toFixed(2)}（3 年年化 ${thesis.valuation.base.cagrPct.toFixed(1)}%），警惕市场将短期景气外推为永续增速。`,
    ],
    quotesWithAnchors: [
      {
        topic: thesis.hypotheses[0].metricLabel,
        summary: thesis.hypotheses[0].note,
        sourceAnchor: anchor,
      },
      {
        topic: thesis.hypotheses[1].metricLabel,
        summary: thesis.hypotheses[1].note,
        sourceAnchor: thesis.crossChecks[0]?.sourceAnchor ?? anchor,
      },
    ],
  });
}

export function buildGroundedRedTeam(
  thesis: ThesisDetail,
  secSnapshot: SecSnapshot | null,
): RedTeamReport {
  const filingAnchor = secSnapshot?.filings[0]
    ? `${thesis.ticker} ${secSnapshot.filings[0].form} Item 1A (${secSnapshot.filings[0].filingDate})`
    : `${thesis.ticker} 10-K Item 1A 风险披露`;

  return RedTeamReportSchema.parse({
    ticker: thesis.ticker,
    thesisSummary: thesis.convictionSummary,
    challenges: [
      {
        id: "rt-1",
        question: `如果「${thesis.hypotheses[0].title}」在未来两季失速，你的估值底线是否被高估？`,
        falsificationPath: `当 ${thesis.hypotheses[0].metricLabel} 连续两季跌破 ${thesis.hypotheses[0].threshold}，盈利预期将向悲观 EPS $${thesis.valuation.bear.eps} 靠拢。`,
        severity: "critical",
        sourceAnchor: filingAnchor,
      },
      {
        id: "rt-2",
        question: `当前中性估值隐含 ${thesis.valuation.base.peMultiple}x PE，若行业资本开支周期见顶，杀估值与杀业绩是否会双击？`,
        falsificationPath: `若市场把估值中枢压缩至悲观情景 ${thesis.valuation.bear.peMultiple}x，对应下行空间约 ${thesis.valuation.downsidePct.toFixed(1)}%（目标价 $${thesis.valuation.bear.targetPrice.toFixed(2)}）。`,
        severity: "high",
        sourceAnchor: `${thesis.ticker} 三情景赔率模型 · 悲观情景`,
      },
      {
        id: "rt-3",
        question: `针对「${thesis.hypotheses[2].title}」，产业链上下游是否已经出现提前备货与透支需求？`,
        falsificationPath: `若核心观测指标「${thesis.hypotheses[2].metricLabel}」触发 ${thesis.hypotheses[2].threshold} 反向突破，应立即启动交易纪律减仓审查。`,
        severity: "moderate",
        sourceAnchor: thesis.crossChecks[0]?.sourceAnchor ?? filingAnchor,
      },
    ],
  });
}

export function buildGroundedVideoScript(
  thesis: ThesisDetail,
  secSnapshot: SecSnapshot | null,
): VideoScript {
  const ratio =
    thesis.valuation.riskRewardRatio !== null
      ? `${thesis.valuation.riskRewardRatio.toFixed(2)} 倍`
      : "无明显下行保底";
  const secFact = secSnapshot?.facts[0]
    ? `SEC 财报实证：${secSnapshot.facts[0].period} ${secSnapshot.facts[0].label} 达到 ${secSnapshot.facts[0].valueFormatted}。`
    : `当前市场参考价 $${thesis.currentPrice.toFixed(2)}，已按三情景完成自主赔率测算。`;

  return VideoScriptSchema.parse({
    ticker: thesis.ticker,
    title: `别再听消息买 ${thesis.companyName}（${thesis.ticker}）：3 个可证伪指标算清 ${thesis.horizonYears} 年赔率`,
    estimatedMinutes: 6,
    hook: `很多人看 ${thesis.companyName} 只盯着短期涨跌，但真正决定你能不能拿住的，不是 K 线，而是这 3 条写死的证伪红线和自己亲手算出来的赔率锚点。`,
    businessContrast: `${thesis.companyName} 处在「${thesis.sectorTag}」赛道。核心逻辑一句话：${thesis.convictionSummary}`,
    firstPrinciplesEvidence: [
      secFact,
      `核心假设一：${thesis.hypotheses[0].title}（阈值 ${thesis.hypotheses[0].threshold}）—— ${thesis.hypotheses[0].note}`,
      `三情景赔率：悲观 $${thesis.valuation.bear.targetPrice.toFixed(0)} / 中性 $${thesis.valuation.base.targetPrice.toFixed(0)} / 乐观 $${thesis.valuation.bull.targetPrice.toFixed(0)}，对应中性 3 年年化 ${thesis.valuation.base.cagrPct.toFixed(1)}%，当前赔率比 ${ratio}。`,
    ],
    riskDisclosure: `最后必须讲清认错条件：重点盯紧「${thesis.hypotheses[2].title}」，一旦触发证伪红线绝不幻想，也绝不使用杠杆放大波动。以上仅为个人研究框架拆解，不构成投资建议。`,
    closingLine: "在噪音里，把听来的观点，炼成自己算出来的底气。下期见。",
  });
}
