import type { QuarterlyReview, ThesisDetail, ThesisRevision } from "@kanon/core";
import type { AgentProposal } from "./types";

function computeTargetDrift(revisions: readonly ThesisRevision[]): string {
  if (revisions.length < 2) return "尚无跨期目标价漂移记录";
  const latest = revisions[0];
  const earliest = revisions[revisions.length - 1];
  if (!latest || !earliest || earliest.baseTargetPrice <= 0) return "尚无跨期目标价漂移记录";
  const pct =
    ((latest.baseTargetPrice - earliest.baseTargetPrice) / earliest.baseTargetPrice) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `中性目标价跨期变动 ${sign}${pct.toFixed(1)}%（$${earliest.baseTargetPrice.toFixed(1)} → $${latest.baseTargetPrice.toFixed(1)}）`;
}

function findWeakenedProposal(
  thesis: ThesisDetail,
  latestReview: QuarterlyReview,
  citation: string,
): AgentProposal | undefined {
  const weakened = latestReview.hypothesisVerdicts.find((v) => v.verdict === "weakened");
  if (!weakened) return undefined;
  const idx = thesis.hypotheses.findIndex((h) => h.id === weakened.hypothesisId);
  const target = idx >= 0 ? thesis.hypotheses[idx] : thesis.hypotheses[0];
  if (!target || target.status === "warning") return undefined;
  return {
    id: "prop-quarterly-drift-warn",
    target: "hypothesis_update",
    title: `季度复盘检出削弱：将假设 0${Math.max(0, idx) + 1} 下调至预警`,
    beforePreview: `[${target.status}] ${target.note}`,
    content: `${target.note} [${latestReview.quarterLabel} 季度复盘提示削弱：${weakened.evidence}]`,
    rationale: "最新财报复盘已判定核心前提削弱，应同步下调假设状态防止锚定偏误。",
    citation,
    meta: { hypothesisIndex: Math.max(0, idx), hypothesisStatus: "warning" },
  };
}

export function runPortfolioDisciplineTool(thesis: ThesisDetail): {
  finding: string;
  citation: string;
  proposal?: AgentProposal;
} {
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

export function runQuarterlyDriftTool(params: {
  thesis: ThesisDetail;
  reviews: readonly QuarterlyReview[];
  revisions: readonly ThesisRevision[];
}): { finding: string; citation: string; proposal?: AgentProposal } {
  const { thesis, reviews, revisions } = params;
  const driftNote = computeTargetDrift(revisions);
  const citation = `${thesis.ticker} 季度复盘 (${reviews.length}次) & 演进日志 (${revisions.length}条)`;
  const latest = reviews[0];
  if (!latest) {
    return {
      finding: `尚未录入季度财报复盘；${driftNote}。建议在财报披露后 48 小时内于 Step 5 完成逐条假设验证。`,
      citation,
    };
  }
  const counts = latest.hypothesisVerdicts.reduce(
    (acc, v) => {
      acc[v.verdict] += 1;
      return acc;
    },
    { strengthened: 0, unchanged: 0, weakened: 0 },
  );
  const finding = `最近复盘 ${latest.quarterLabel}：强化 ${counts.strengthened} / 持平 ${counts.unchanged} / 削弱 ${counts.weakened} 条假设；${driftNote}。`;
  return {
    finding,
    citation: `${latest.quarterLabel} 财报复盘 · ${citation}`,
    proposal: findWeakenedProposal(thesis, latest, `${latest.quarterLabel} 季度复盘`),
  };
}
