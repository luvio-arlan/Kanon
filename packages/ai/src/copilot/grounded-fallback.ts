import type { SecSnapshot, ThesisDetail } from "@kanon/core";
import {
  type EarningsDigest,
  EarningsDigestSchema,
  type InvestmentMemo,
  InvestmentMemoSchema,
  type RedTeamReport,
  RedTeamReportSchema,
} from "../schemas/copilot";

function extractTranscriptSnippets(sourceText: string | undefined): string[] {
  if (!sourceText?.trim()) return [];
  return sourceText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12)
    .slice(0, 3);
}

function buildDigestMeta(
  thesis: ThesisDetail,
  secSnapshot: SecSnapshot | null,
  snippets: readonly string[],
) {
  const latestFiling = secSnapshot?.filings[0];
  const anchor = latestFiling
    ? `${thesis.ticker} ${latestFiling.form} (${latestFiling.filingDate})`
    : `${thesis.ticker} 季度电话会与一阶档案`;
  const factLine = secSnapshot?.facts[0]
    ? `${secSnapshot.facts[0].label} ${secSnapshot.facts[0].valueFormatted}（${secSnapshot.facts[0].period}）`
    : `当前参考价 $${thesis.currentPrice.toFixed(2)}`;
  const quarterLabel =
    snippets.length > 0
      ? "基于用户粘贴原文提炼"
      : latestFiling
        ? `${latestFiling.form} · ${latestFiling.filingDate}`
        : "最新季度跟踪";
  const guidanceSummary =
    snippets.length > 0
      ? `已基于粘贴原文交叉核对 ${thesis.companyName}（${thesis.ticker}）核心逻辑：${snippets[0]}。对应一阶财务锚点：${factLine}。`
      : `${thesis.companyName}（${thesis.ticker}）核心跟踪主线：${thesis.convictionSummary} 一阶事实锚点：${factLine}。`;
  return { anchor, quarterLabel, guidanceSummary };
}

export function buildGroundedEarningsDigest(
  thesis: ThesisDetail,
  secSnapshot: SecSnapshot | null,
  sourceText?: string,
): EarningsDigest {
  const snippets = extractTranscriptSnippets(sourceText);
  const { anchor, quarterLabel, guidanceSummary } = buildDigestMeta(thesis, secSnapshot, snippets);
  const crossCheck = thesis.crossChecks[0];

  return EarningsDigestSchema.parse({
    ticker: thesis.ticker,
    quarterLabel,
    guidanceSummary,
    capexSignals: [
      snippets[1]
        ? `原文关键信号：${snippets[1]}`
        : `围绕「${thesis.hypotheses[0].metricLabel}」核对管理层最新指引是否守住 ${thesis.hypotheses[0].threshold}。`,
      crossCheck
        ? `产业链互证（${crossCheck.peerCompany}）：${crossCheck.takeaway}`
        : "建议在 Step 3 补充至少 1 家上下游核心伙伴的 CapEx 口径对照。",
    ],
    toneShifts: [
      `核心假设「${thesis.hypotheses[2].title}」处于${thesis.hypotheses[2].status === "warning" ? "证伪预警" : "持续观察"}，需紧盯管理层口径变化。`,
      `中性目标价 $${thesis.valuation.base.targetPrice.toFixed(1)}（年化 ${thesis.valuation.base.cagrPct.toFixed(1)}%），警惕将短期景气误判为永续增速。`,
    ],
    quotesWithAnchors: [
      {
        topic: snippets.length > 0 ? "粘贴原文核心锚点" : thesis.hypotheses[0].metricLabel,
        summary: snippets[0] ?? thesis.hypotheses[0].note,
        sourceAnchor: snippets.length > 0 ? "用户导入电话会 / 财报原文" : anchor,
      },
      {
        topic: thesis.hypotheses[1].metricLabel,
        summary: thesis.hypotheses[1].note,
        sourceAnchor: crossCheck?.sourceAnchor ?? anchor,
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
        falsificationPath: `当 ${thesis.hypotheses[0].metricLabel} 连续两季未能守住「${thesis.hypotheses[0].threshold}」红线，盈利预期将向悲观 EPS $${thesis.valuation.bear.eps} 靠拢。`,
        severity: "critical",
        sourceAnchor: filingAnchor,
      },
      {
        id: "rt-2",
        question: `中性假设隐含 ${thesis.valuation.base.peMultiple}x PE，若行业资本开支见顶，杀估值与杀业绩是否会双击？`,
        falsificationPath: `若估值压缩至悲观情景 ${thesis.valuation.bear.peMultiple}x，对应下行风险约 ${thesis.valuation.downsidePct.toFixed(1)}%（目标价 $${thesis.valuation.bear.targetPrice.toFixed(1)}）。`,
        severity: "high",
        sourceAnchor: `${thesis.ticker} 三情景赔率模型 · 悲观情景`,
      },
      {
        id: "rt-3",
        question: `针对「${thesis.hypotheses[2].title}」，产业链上下游是否已经出现提前备货与透支需求？`,
        falsificationPath: `若「${thesis.hypotheses[2].metricLabel}」触发 ${thesis.hypotheses[2].threshold} 反向突破，应立即启动交易纪律减仓审查。`,
        severity: "moderate",
        sourceAnchor: thesis.crossChecks[0]?.sourceAnchor ?? filingAnchor,
      },
    ],
  });
}

export function buildGroundedInvestmentMemo(
  thesis: ThesisDetail,
  secSnapshot: SecSnapshot | null,
): InvestmentMemo {
  const ratio =
    thesis.valuation.riskRewardRatio !== null
      ? `${thesis.valuation.riskRewardRatio.toFixed(2)}×`
      : "无明显下行保底";
  const latestAnnual = secSnapshot?.annuals[secSnapshot.annuals.length - 1];
  const secLine = latestAnnual?.grossMarginPct
    ? `SEC 历史实证（${latestAnnual.fiscalYear}）：毛利率 ${latestAnnual.grossMarginPct}%，稀释 EPS ${latestAnnual.dilutedEps !== null ? `$${latestAnnual.dilutedEps}` : "见原件"}。`
    : `当前市场参考价 $${thesis.currentPrice.toFixed(2)}，已完成三情景独立赔率测算。`;
  const latestExit = thesis.disciplineEntries[0]?.exitRule;

  return InvestmentMemoSchema.parse({
    ticker: thesis.ticker,
    headline: `${thesis.companyName}（${thesis.ticker}）一页纸投研备忘录 · ${thesis.horizonYears} 年赔率 ${ratio}`,
    verdictSummary: `当前价 $${thesis.currentPrice.toFixed(2)}，自主测算 ${thesis.horizonYears} 年悲观 / 中性 / 乐观目标价为 $${thesis.valuation.bear.targetPrice.toFixed(1)} / $${thesis.valuation.base.targetPrice.toFixed(1)} / $${thesis.valuation.bull.targetPrice.toFixed(1)}，中性年化 CAGR ${thesis.valuation.base.cagrPct.toFixed(1)}%，期望目标价 $${thesis.valuation.expectedTargetPrice.toFixed(1)}。`,
    moatAndQuality: `${thesis.convictionSummary} ${thesis.businessFilter.notes || ""}`.trim(),
    keyEvidence: [
      secLine,
      ...thesis.hypotheses.map(
        (h, i) => `假设 0${i + 1}（${h.threshold}）：${h.title} — ${h.note}`,
      ),
    ],
    nextQuarterChecklist: [
      `核验「${thesis.hypotheses[0].metricLabel}」最新季报实绩是否稳守 ${thesis.hypotheses[0].threshold}。`,
      `追踪「${thesis.hypotheses[2].metricLabel}」及上下游伙伴最新 CapEx 与需求表态是否出现分歧。`,
      "对照 10-Q 现金流量表检查自由现金流转化率，验证盈利质量未因激进扩产恶化。",
    ],
    exitDiscipline:
      latestExit ??
      `严守零杠杆铁律；若「${thesis.hypotheses[2].title}」触发证伪红线且核心毛利率失守，无条件减仓复盘。`,
  });
}
