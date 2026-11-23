import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { SecSnapshot, ThesisDetail } from "@kanon/core";
import { generateObject, type LanguageModel } from "ai";
import {
  type CopilotAction,
  type CopilotEngineMode,
  type EarningsDigest,
  EarningsDigestSchema,
  type RedTeamReport,
  RedTeamReportSchema,
  type VideoScript,
  VideoScriptSchema,
} from "../schemas/copilot";
import {
  buildGroundedEarningsDigest,
  buildGroundedRedTeam,
  buildGroundedVideoScript,
} from "./grounded-fallback";

export type CopilotPayloadMap = {
  earnings_digest: EarningsDigest;
  red_team: RedTeamReport;
  video_script: VideoScript;
};

export interface CopilotRunResult<TAction extends CopilotAction> {
  action: TAction;
  engine: CopilotEngineMode;
  data: CopilotPayloadMap[TAction];
}

function resolveByokModel(): LanguageModel | null {
  if (process.env.GEMINI_API_KEY) {
    return google("gemini-2.5-flash");
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic("claude-sonnet-4-20250514");
  }
  if (process.env.OPENAI_API_KEY) {
    return openai("gpt-4.1-mini");
  }
  return null;
}

function buildContextBrief(thesis: ThesisDetail, secSnapshot: SecSnapshot | null): string {
  const facts = secSnapshot?.facts
    .map((f) => `${f.label}: ${f.valueFormatted} (${f.period}, ${f.sourceTag})`)
    .join("; ");
  const hyps = thesis.hypotheses
    .map((h, i) => `H${i + 1}[${h.status}] ${h.title} (${h.metricLabel} ${h.threshold}): ${h.note}`)
    .join("\n");
  return [
    `标的: ${thesis.companyName} (${thesis.ticker}) | 赛道: ${thesis.sectorTag} | 当前价: $${thesis.currentPrice}`,
    `核心论点: ${thesis.convictionSummary}`,
    `三情景目标价: 悲观 $${thesis.valuation.bear.targetPrice} / 中性 $${thesis.valuation.base.targetPrice} / 乐观 $${thesis.valuation.bull.targetPrice} (赔率 ${thesis.valuation.riskRewardRatio ?? "∞"})`,
    `SEC 缓存事实: ${facts || "暂未拉取，禁止编造具体财务数字"}`,
    `核心假设:\n${hyps}`,
  ].join("\n");
}

export async function runThesisCopilot<TAction extends CopilotAction>(params: {
  action: TAction;
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
}): Promise<CopilotRunResult<TAction>> {
  const { action, thesis, secSnapshot } = params;
  const model = resolveByokModel();
  const context = buildContextBrief(thesis, secSnapshot);

  if (model) {
    try {
      const data = await runWithModel(model, action, context);
      return { action, engine: "vercel-ai-sdk", data };
    } catch {
      // Safe deterministic fallback if external provider errors or rate-limits
    }
  }

  return {
    action,
    engine: "grounded-local",
    data: runGroundedLocal(action, thesis, secSnapshot),
  };
}

async function runWithModel<TAction extends CopilotAction>(
  model: LanguageModel,
  action: TAction,
  context: string,
): Promise<CopilotPayloadMap[TAction]> {
  const system =
    "你是 KANON 顶级买方投资研究副驾驶。严禁编造任何未提供的财务数字，必须使用精炼专业的简体中文输出结构化结果。";

  if (action === "earnings_digest") {
    const res = await generateObject({
      model,
      schema: EarningsDigestSchema,
      system,
      prompt: `基于以下档案提炼电话会核心指引、资本开支信号与措辞变化，并附来源锚点：\n${context}`,
    });
    return res.object as CopilotPayloadMap[TAction];
  }
  if (action === "red_team") {
    const res = await generateObject({
      model,
      schema: RedTeamReportSchema,
      system,
      prompt: `切换至苛刻空头分析师视角，针对以下看多逻辑输出 3 个最具杀伤力的反驳问题与证伪路径：\n${context}`,
    });
    return res.object as CopilotPayloadMap[TAction];
  }
  const res = await generateObject({
    model,
    schema: VideoScriptSchema,
    system,
    prompt: `将以下 5 步研究档案转化为高质感 5-8 分钟美股投研口播大纲（钩子+商业对比+证据+风险）：\n${context}`,
  });
  return res.object as CopilotPayloadMap[TAction];
}

function runGroundedLocal<TAction extends CopilotAction>(
  action: TAction,
  thesis: ThesisDetail,
  secSnapshot: SecSnapshot | null,
): CopilotPayloadMap[TAction] {
  if (action === "earnings_digest") {
    return buildGroundedEarningsDigest(thesis, secSnapshot) as CopilotPayloadMap[TAction];
  }
  if (action === "red_team") {
    return buildGroundedRedTeam(thesis, secSnapshot) as CopilotPayloadMap[TAction];
  }
  return buildGroundedVideoScript(thesis, secSnapshot) as CopilotPayloadMap[TAction];
}
