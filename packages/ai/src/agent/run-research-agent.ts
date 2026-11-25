import {
  analyzeSecForensics,
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type MarketQuoteSnapshot,
  type QuarterlyReview,
  type SecSnapshot,
  type ThesisDetail,
  type ThesisRevision,
} from "@kanon/core";
import { type LanguageModel, streamObject } from "ai";
import { z } from "zod";
import { type ByokCredentials, resolveByokModel } from "../copilot/run-copilot";
import { RESEARCH_AGENT_TOOLS } from "./tool-registry";
import {
  type AgentBriefing,
  AgentBriefingSchema,
  type AgentProposal,
  type AgentStreamEvent,
  type AgentTraceStep,
} from "./types";

const MAX_AGENT_STEPS = 8;

const IcSynthesisSchema = z.object({
  verdict: z.string().min(8),
  bullSynthesis: z.string().min(12),
  bearCritique: z.string().min(12),
  bearRebuttal: z.string().min(10),
  accountingCheck: z.string().min(10),
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

function buildSynthesisPrompt(thesis: ThesisDetail, traces: readonly AgentTraceStep[]): string {
  const evidenceBlock = traces
    .map((t) => `[工具 ${t.stepIndex} · ${t.label}] ${t.finding} (溯源: ${t.citation})`)
    .join("\n");
  return `标的：${thesis.companyName} (${thesis.ticker}) | 现价 $${thesis.currentPrice}\n核心论点：${thesis.convictionSummary}\n\n确定性工具审计证据：\n${evidenceBlock}`;
}

async function* streamLlmSynthesis(
  model: LanguageModel,
  thesis: ThesisDetail,
  traces: readonly AgentTraceStep[],
): AsyncGenerator<
  AgentStreamEvent,
  { engine: "vercel-ai-sdk" | "grounded-local"; fallbackReason?: string; synth: IcSynthesisResult }
> {
  try {
    const stream = streamObject({
      model,
      schema: IcSynthesisSchema,
      system:
        "你是 KANON 买方投委会（IC）多角色辩论引擎。严禁编造任何未提供的数字，必须依次输出：PM 综合判定、多头预期差、法证空头下行推演、空头针对多头核心假设的二次质询（bearRebuttal）、财务法证审阅结论（简体中文，克制严谨）。",
      prompt: buildSynthesisPrompt(thesis, traces),
    });
    for await (const partial of stream.partialObjectStream) {
      yield {
        type: "synthesis_partial",
        partial: { engine: "vercel-ai-sdk", ...partial },
      };
    }
    const finalObj = await stream.object;
    return { engine: "vercel-ai-sdk", synth: finalObj };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 80) : "模型调用超时";
    return {
      engine: "grounded-local",
      fallbackReason: `BYOK 投委会综合异常（${msg}），已自动降级为本地确定性引擎`,
      synth: buildLocalSynthesis(thesis, traces),
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

export async function* streamResearchAgent(params: {
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
  reviews?: readonly QuarterlyReview[];
  revisions?: readonly ThesisRevision[];
  marketQuote?: MarketQuoteSnapshot | null;
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
    const { trace, proposal } = executeToolStep(tool, stepIndex, params);
    traces.push(trace);
    if (proposal) proposals.push(proposal);
    yield { type: "trace_done", trace };
  }

  const model = resolveByokModel(params.byok);
  const outcome = model
    ? yield* streamLlmSynthesis(model, params.thesis, traces)
    : {
        engine: "grounded-local" as const,
        fallbackReason: undefined,
        synth: buildLocalSynthesis(params.thesis, traces),
      };

  const briefing: AgentBriefing = AgentBriefingSchema.parse({
    ticker: params.thesis.ticker,
    engine: outcome.engine,
    ...(outcome.fallbackReason ? { fallbackReason: outcome.fallbackReason } : {}),
    ...outcome.synth,
    convictionScore: computeConvictionScore(params.thesis, params.secSnapshot),
    traces,
    proposals: proposals.slice(0, 8),
  });
  yield { type: "briefing_ready", briefing };
}
