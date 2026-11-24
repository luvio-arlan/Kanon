import {
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type SecSnapshot,
  type ThesisDetail,
} from "@kanon/core";
import type { ByokCredentials } from "../copilot/run-copilot";
import { RESEARCH_AGENT_TOOLS } from "./tool-registry";
import {
  type AgentBriefing,
  AgentBriefingSchema,
  type AgentProposal,
  type AgentStreamEvent,
  type AgentTraceStep,
} from "./types";

const MAX_AGENT_STEPS = 5;

function computeConvictionScore(thesis: ThesisDetail, secSnapshot: SecSnapshot | null): number {
  const readiness = calculateResearchReadiness(thesis);
  const exp = calculateImpliedExpectations({ summary: thesis.valuation });
  const quality = analyzeSecQuality(secSnapshot?.annuals ?? []);
  let score = Math.round(readiness.scorePct * 0.45);
  if (thesis.valuation.convictionZone === "attractive") score += 25;
  else if (thesis.valuation.convictionZone === "balanced") score += 16;
  else score += 6;
  if (exp.isBelowHurdle15) score += 12;
  if (quality?.qualityGrade === "compounder") score += 12;
  else if (quality) score += 7;
  if (thesis.businessFilter.variantPerception.trim().length >= 10) score += 6;
  return Math.min(98, Math.max(20, score));
}

function buildIcBriefing(params: {
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
  traces: AgentTraceStep[];
  proposals: AgentProposal[];
}): AgentBriefing {
  const { thesis, secSnapshot, traces, proposals } = params;
  const ratio =
    thesis.valuation.riskRewardRatio !== null
      ? `${thesis.valuation.riskRewardRatio.toFixed(2)}×`
      : "∞";
  const score = computeConvictionScore(thesis, secSnapshot);
  const verdict =
    thesis.valuation.convictionZone === "attractive"
      ? `具备显著赔率不对称（${ratio}），建议围绕核心假设红线严守零杠杆跟踪`
      : thesis.valuation.convictionZone === "balanced"
        ? `当前赔率处于均衡区间（${ratio}），建议耐心等待更好安全边际或核心争论明朗`
        : `当前估值偏紧（${ratio}），不具备足够安全边际，严禁情绪化追高`;

  const h0 = thesis.hypotheses[0];
  const hLast = thesis.hypotheses[thesis.hypotheses.length - 1] ?? h0;
  return AgentBriefingSchema.parse({
    ticker: thesis.ticker,
    engine: "grounded-local",
    verdict,
    convictionScore: score,
    bullSynthesis:
      thesis.businessFilter.variantPerception.trim() ||
      `${thesis.companyName} 核心驱动在于「${h0?.title ?? thesis.convictionSummary}」，中性目标 $${thesis.valuation.base.targetPrice.toFixed(1)}（年化 ${thesis.valuation.base.cagrPct.toFixed(1)}%）。`,
    bearCritique:
      thesis.businessFilter.preMortem.trim() ||
      `最大下行风险来自「${hLast?.title ?? "核心盈利假设"}」证伪叠加估值回落至 ${thesis.valuation.bear.peMultiple}x（回撤 ${thesis.valuation.downsidePct.toFixed(1)}%）。`,
    accountingCheck: traces[0]?.finding ?? "暂缺多年度 SEC 现金流数据，建议先执行同步。",
    traces,
    proposals: proposals.slice(0, 4),
  });
}

export async function* streamResearchAgent(params: {
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
  byok?: ByokCredentials;
}): AsyncGenerator<AgentStreamEvent> {
  const traces: AgentTraceStep[] = [];
  const proposals: AgentProposal[] = [];
  const tools = RESEARCH_AGENT_TOOLS.slice(0, MAX_AGENT_STEPS);

  for (let i = 0; i < tools.length; i += 1) {
    const tool = tools[i];
    if (!tool) continue;
    const stepIndex = i + 1;
    yield { type: "trace_start", stepIndex, toolName: tool.name, label: tool.label };

    const started = performance.now();
    const out = tool.execute({ thesis: params.thesis, secSnapshot: params.secSnapshot });
    const durationMs = Math.max(1, Math.round(performance.now() - started));

    const trace: AgentTraceStep = {
      stepIndex,
      toolName: tool.name,
      label: tool.label,
      status: "done",
      durationMs,
      finding: out.finding,
      citation: out.citation,
    };
    traces.push(trace);
    if (out.proposal) proposals.push(out.proposal);
    yield { type: "trace_done", trace };
  }

  const briefing = buildIcBriefing({
    thesis: params.thesis,
    secSnapshot: params.secSnapshot,
    traces,
    proposals,
  });
  yield { type: "briefing_ready", briefing };
}
