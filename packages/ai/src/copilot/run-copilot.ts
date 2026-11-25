import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  analyzeSecQuality,
  calculateImpliedExpectations,
  type SecSnapshot,
  type ThesisDetail,
} from "@kanon/core";
import { generateObject, type LanguageModel } from "ai";
import {
  type ByokProvider,
  type CopilotAction,
  type CopilotEngineMode,
  type EarningsDigest,
  EarningsDigestSchema,
  type InvestmentMemo,
  InvestmentMemoSchema,
  type RedTeamReport,
  RedTeamReportSchema,
} from "../schemas/copilot";
import {
  buildGroundedEarningsDigest,
  buildGroundedInvestmentMemo,
  buildGroundedRedTeam,
} from "./grounded-fallback";

export type CopilotPayloadMap = {
  earnings_digest: EarningsDigest;
  red_team: RedTeamReport;
  investment_memo: InvestmentMemo;
};

export interface ByokCredentials {
  provider: ByokProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export interface CopilotRunResult<TAction extends CopilotAction> {
  action: TAction;
  engine: CopilotEngineMode;
  fallbackReason?: string;
  data: CopilotPayloadMap[TAction];
}

const DEFAULT_OPENAI_COMPATIBLE_BASE = "https://api.deepseek.com/v1";

function isPrivateOrMetadataHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    bare === "0.0.0.0" ||
    bare === "::1" ||
    bare === "::" ||
    bare.endsWith(".internal") ||
    bare.endsWith(".local")
  ) {
    return true;
  }
  if (
    /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(
      bare,
    )
  ) {
    return true;
  }
  return /^(?:fc|fd|fe[89ab]|::ffff:)/.test(bare);
}

export function sanitizeProviderBaseUrl(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    const allowLocal = process.env.NODE_ENV !== "production";
    if (isLocal) {
      return allowLocal && (parsed.protocol === "http:" || parsed.protocol === "https:")
        ? parsed.toString().replace(/\/$/, "")
        : undefined;
    }
    if (isPrivateOrMetadataHost(host)) return undefined;
    if (parsed.protocol === "https:") return parsed.toString().replace(/\/$/, "");
    return undefined;
  } catch (err) {
    void err;
    return undefined;
  }
}

function resolveExplicitByok(byok: ByokCredentials): LanguageModel {
  const apiKey = byok.apiKey.trim();
  const model = byok.model?.trim();
  const baseURL = sanitizeProviderBaseUrl(byok.baseUrl);
  const opts = baseURL ? { apiKey, baseURL } : { apiKey };

  if (byok.provider === "gemini") {
    return createGoogleGenerativeAI(opts)(model || "gemini-2.5-flash");
  }
  if (byok.provider === "anthropic") {
    return createAnthropic(opts)(model || "claude-sonnet-4-20250514");
  }
  if (byok.provider === "openai_compatible") {
    return createOpenAI({ apiKey, baseURL: baseURL || DEFAULT_OPENAI_COMPATIBLE_BASE })(
      model || "deepseek-chat",
    );
  }
  return createOpenAI(opts)(model || "gpt-4.1-mini");
}

function resolveEnvModel(): LanguageModel | null {
  if (process.env.GEMINI_API_KEY) {
    return createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })(
      process.env.KANON_GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    );
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(
      process.env.KANON_ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514",
    );
  }
  if (process.env.OPENAI_API_KEY) {
    const baseURL = process.env.OPENAI_BASE_URL?.trim();
    return createOpenAI(
      baseURL
        ? { apiKey: process.env.OPENAI_API_KEY, baseURL }
        : { apiKey: process.env.OPENAI_API_KEY },
    )(process.env.KANON_OPENAI_MODEL?.trim() || "gpt-4.1-mini");
  }
  return null;
}

export function resolveByokModel(byok?: ByokCredentials): LanguageModel | null {
  if (byok?.apiKey.trim()) {
    return resolveExplicitByok(byok);
  }
  return resolveEnvModel();
}

function buildContextBrief(
  thesis: ThesisDetail,
  secSnapshot: SecSnapshot | null,
  sourceText?: string,
): string {
  const quality = analyzeSecQuality(secSnapshot?.annuals ?? []);
  const expectations = calculateImpliedExpectations({
    summary: thesis.valuation,
    trailingEps: quality?.latestEps,
  });
  const facts = secSnapshot?.facts
    .map((f) => `${f.label}: ${f.valueFormatted} (${f.period})`)
    .join("; ");
  const hyps = thesis.hypotheses
    .map((h, i) => `H${i + 1}[${h.status}] ${h.title} (${h.metricLabel} ${h.threshold}): ${h.note}`)
    .join("\n");
  const checks = thesis.crossChecks
    .slice(0, 4)
    .map((c) => `- ${c.peerCompany}[${c.alignment}] ${c.topic}: ${c.takeaway}`)
    .join("\n");
  const qualityLine = quality
    ? `SEC ${quality.yearsCovered}年画像: ${quality.qualityLabel} | 营收CAGR ${quality.revenueCagrPct ?? "—"}% | 毛利率均值 ${quality.avgGrossMarginPct ?? "—"}% | FCF转化 ${quality.fcfConversionPct ?? "—"}% | CapEx强度 ${quality.capexIntensityPct ?? "—"}%`
    : "";
  return [
    `标的: ${thesis.companyName} (${thesis.ticker}) | 赛道: ${thesis.sectorTag} | 当前价: $${thesis.currentPrice}`,
    `核心论点: ${thesis.convictionSummary}`,
    `三情景目标价: 悲观 $${thesis.valuation.bear.targetPrice} / 中性 $${thesis.valuation.base.targetPrice} / 乐观 $${thesis.valuation.bull.targetPrice} (赔率 ${thesis.valuation.riskRewardRatio ?? "∞"} | 安全边际 ${expectations.marginOfSafetyPct}% | 15%买点 $${expectations.hurdleEntry15})`,
    `SEC 缓存事实: ${facts || "暂未拉取，严禁编造任何具体财务数字"}`,
    qualityLine,
    `核心假设:\n${hyps}`,
    checks ? `产业链交叉验证:\n${checks}` : "",
    sourceText?.trim() ? `用户粘贴的一阶电话会/财报原文:\n${sourceText.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function runWithModel<TAction extends CopilotAction>(
  model: LanguageModel,
  action: TAction,
  context: string,
): Promise<CopilotPayloadMap[TAction]> {
  const system =
    "你是服务机构级价值投资者的 KANON 买方研究副驾驶。严禁编造任何未提供的财务数字，输出必须客观、克制、专业且使用简体中文。";

  if (action === "earnings_digest") {
    const res = await generateObject({
      model,
      schema: EarningsDigestSchema,
      system,
      prompt: `基于以下档案与原文提炼管理层核心指引、资本开支信号与措辞变化，并附原文锚点：\n${context}`,
    });
    return res.object as CopilotPayloadMap[TAction];
  }
  if (action === "red_team") {
    const res = await generateObject({
      model,
      schema: RedTeamReportSchema,
      system,
      prompt: `切换至审慎空头分析师视角，针对以下看多逻辑输出 3 个最具穿透力的反向质询与证伪路径：\n${context}`,
    });
    return res.object as CopilotPayloadMap[TAction];
  }
  const res = await generateObject({
    model,
    schema: InvestmentMemoSchema,
    system,
    prompt: `将以下 5 步研究档案凝练为一份供长期跟踪与投委会复盘的「一页纸投研备忘录」（核心赔率结论、竞争壁垒、一阶证据、下季复盘核查清单与离场执行纪律）：\n${context}`,
  });
  return res.object as CopilotPayloadMap[TAction];
}

export async function runThesisCopilot<TAction extends CopilotAction>(params: {
  action: TAction;
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
  sourceText?: string;
  byok?: ByokCredentials;
}): Promise<CopilotRunResult<TAction>> {
  const { action, thesis, secSnapshot, sourceText, byok } = params;
  const model = resolveByokModel(byok);
  const context = buildContextBrief(thesis, secSnapshot, sourceText);

  let fallbackReason: string | undefined;
  if (model) {
    try {
      const data = await runWithModel(model, action, context);
      return { action, engine: "vercel-ai-sdk", data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "上游模型调用失败";
      fallbackReason = `BYOK 模型调用异常：${msg.slice(0, 80)}`;
    }
  }

  const data =
    action === "earnings_digest"
      ? buildGroundedEarningsDigest(thesis, secSnapshot, sourceText)
      : action === "red_team"
        ? buildGroundedRedTeam(thesis, secSnapshot)
        : buildGroundedInvestmentMemo(thesis, secSnapshot);

  return {
    action,
    engine: "grounded-local",
    ...(fallbackReason ? { fallbackReason } : {}),
    data: data as CopilotPayloadMap[TAction],
  };
}
