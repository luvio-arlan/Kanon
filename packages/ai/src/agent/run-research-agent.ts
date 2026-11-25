import {
  analyzeSecForensics,
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type MarketBenchmarkResponse,
  type MarketQuoteSnapshot,
  type QuarterlyReview,
  type ResearchNote,
  type SecFilingReaderResponse,
  type SecSnapshot,
  type ThesisDetail,
  type ThesisRevision,
} from "@kanon/core";
import { type LanguageModel, streamObject } from "ai";
import { z } from "zod";
import { type ByokCredentials, resolveByokModel } from "../copilot/run-copilot";
import {
  type AutonomousIcContext,
  buildFullDossierContext,
  runAutonomousIcInvestigation,
} from "./autonomous-ic";
import {
  type LlmProposalDraft,
  LlmProposalDraftSchema,
  mergeGroundedProposals,
} from "./proposal-grounding";
import { RESEARCH_AGENT_TOOLS } from "./tool-registry";
import {
  type AgentBriefing,
  AgentBriefingSchema,
  type AgentProposal,
  type AgentStreamEvent,
  type AgentTraceStep,
} from "./types";

const MAX_AGENT_STEPS = 9;

const IcSynthesisSchema = z.object({
  verdict: z.string().min(8),
  bullSynthesis: z.string().min(12),
  bearCritique: z.string().min(12),
  bearRebuttal: z.string().min(10),
  accountingCheck: z.string().min(10),
  customProposals: z.array(LlmProposalDraftSchema).max(3).optional(),
});

type IcSynthesisResult = z.infer<typeof IcSynthesisSchema>;

function computeConvictionScore(thesis: ThesisDetail, secSnapshot: SecSnapshot | null): number {
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
  if (forensics && forensics.redFlags.length > 0)
    score -= Math.min(12, forensics.redFlags.length * 4);
  return Math.min(98, Math.max(18, score));
}

function buildLocalSynthesis(
  thesis: ThesisDetail,
  traces: readonly AgentTraceStep[],
): IcSynthesisResult {
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
  };
}

async function* streamLlmSynthesis(
  model: LanguageModel,
  ctx: AutonomousIcContext,
  traces: readonly AgentTraceStep[],
  investigationSummary: string,
): AsyncGenerator<
  AgentStreamEvent,
  {
    engine: "vercel-ai-sdk" | "grounded-local";
    fallbackReason?: string;
    synth: IcSynthesisResult;
    llmDrafts?: readonly LlmProposalDraft[];
  }
> {
  const evidenceBlock = traces
    .map((t) => `[步骤 ${t.stepIndex} · ${t.label}] ${t.finding} (溯源: ${t.citation})`)
    .join("\n");
  const prompt = `${buildFullDossierContext(ctx)}\n\n确定性工具审计证据：\n${evidenceBlock}${investigationSummary ? `\n\n首席调查员自主查证结论：\n${investigationSummary}` : ""}`;
  try {
    const stream = streamObject({
      model,
      schema: IcSynthesisSchema,
      system:
        "你是 KANON 买方投委会（IC）多角色辩论引擎。严禁编造任何未提供的数字，必须引用原文坐标或财务事实依次输出：PM 综合判定、多头预期差、法证空头下行推演、空头针对多头核心假设的二次质询（bearRebuttal）、财务法证审阅结论，以及最多 3 条引用上述工具数字的 customProposals（简体中文，克制严谨）。",
      prompt,
    });
    for await (const partial of stream.partialObjectStream) {
      yield { type: "synthesis_partial", partial: { engine: "vercel-ai-sdk", ...partial } };
    }
    const finalObj = await stream.object;
    return { engine: "vercel-ai-sdk", synth: finalObj, llmDrafts: finalObj.customProposals };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 80) : "模型调用超时";
    return {
      engine: "grounded-local",
      fallbackReason: `BYOK 投委会综合异常（${msg}），已自动降级为本地确定性引擎`,
      synth: buildLocalSynthesis(ctx.thesis, traces),
    };
  }
}

function executeToolStep(
  tool: (typeof RESEARCH_AGENT_TOOLS)[number],
  stepIndex: number,
  ctx: Parameters<(typeof RESEARCH_AGENT_TOOLS)[number]["execute"]>[0],
) {
  const started = performance.now();
  const out = tool.execute(ctx);
  const trace: AgentTraceStep = {
    stepIndex,
    toolName: tool.name,
    label: tool.label,
    status: "done",
    durationMs: Math.max(1, Math.round(performance.now() - started)),
    finding: out.finding,
    citation: out.citation,
  };
  return { trace, proposal: out.proposal };
}

function finalizeBriefing(params: {
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
  traces: AgentTraceStep[];
  proposals: AgentProposal[];
  outcome: {
    engine: "vercel-ai-sdk" | "grounded-local";
    fallbackReason?: string;
    synth: IcSynthesisResult;
    llmDrafts?: readonly LlmProposalDraft[];
  };
}): AgentBriefing {
  const evidenceCorpus = [
    ...params.traces.map((t) => t.finding),
    params.thesis.convictionSummary,
    `$${params.thesis.currentPrice}`,
  ].join("\n");
  const finalProposals = mergeGroundedProposals({
    llmDrafts: params.outcome.llmDrafts,
    deterministic: params.proposals,
    evidenceCorpus,
  });
  return AgentBriefingSchema.parse({
    ticker: params.thesis.ticker,
    engine: params.outcome.engine,
    ...(params.outcome.fallbackReason ? { fallbackReason: params.outcome.fallbackReason } : {}),
    verdict: params.outcome.synth.verdict,
    bullSynthesis: params.outcome.synth.bullSynthesis,
    bearCritique: params.outcome.synth.bearCritique,
    bearRebuttal: params.outcome.synth.bearRebuttal,
    accountingCheck: params.outcome.synth.accountingCheck,
    convictionScore: computeConvictionScore(params.thesis, params.secSnapshot),
    traces: params.traces,
    proposals: finalProposals,
  });
}

async function* resolveSynthesisOutcome(
  model: LanguageModel | null,
  params: AutonomousIcContext,
  traces: AgentTraceStep[],
) {
  if (!model) {
    return {
      engine: "grounded-local" as const,
      fallbackReason: undefined,
      synth: buildLocalSynthesis(params.thesis, traces),
      llmDrafts: undefined,
    };
  }
  const inv = await runAutonomousIcInvestigation(model, params, traces.length);
  for (const extraTrace of inv.traces) {
    traces.push(extraTrace);
    yield { type: "trace_done" as const, trace: extraTrace };
  }
  return yield* streamLlmSynthesis(model, params, traces, inv.investigationSummary);
}

export async function* streamResearchAgent(params: {
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
  reviews?: readonly QuarterlyReview[];
  revisions?: readonly ThesisRevision[];
  marketQuote?: MarketQuoteSnapshot | null;
  cachedFilings?: readonly SecFilingReaderResponse[];
  researchNotes?: readonly ResearchNote[];
  benchmarks?: MarketBenchmarkResponse | null;
  sourceText?: string;
  byok?: ByokCredentials;
}): AsyncGenerator<AgentStreamEvent> {
  const traces: AgentTraceStep[] = [];
  const proposals: AgentProposal[] = [];
  for (const [idx, toolSpec] of RESEARCH_AGENT_TOOLS.slice(0, MAX_AGENT_STEPS).entries()) {
    const stepIndex = idx + 1;
    yield { type: "trace_start", stepIndex, toolName: toolSpec.name, label: toolSpec.label };
    const { trace, proposal } = executeToolStep(toolSpec, stepIndex, params);
    traces.push(trace);
    if (proposal) proposals.push(proposal);
    yield { type: "trace_done", trace };
  }
  const outcome = yield* resolveSynthesisOutcome(resolveByokModel(params.byok), params, traces);
  yield {
    type: "briefing_ready",
    briefing: finalizeBriefing({
      thesis: params.thesis,
      secSnapshot: params.secSnapshot,
      traces,
      proposals,
      outcome,
    }),
  };
}
