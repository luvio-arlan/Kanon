import {
  type AgentAskResponse,
  AgentAskResponseSchema,
  analyzeSecForensics,
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculateTrueReverseDcf,
  type ResearchNote,
  type SecFilingReaderResponse,
  type SecSnapshot,
  type ThesisDetail,
} from "@kanon/core";
import { generateObject } from "ai";
import { z } from "zod";
import { type ByokCredentials, resolveByokModel } from "../copilot/run-copilot";
import { searchFilingExcerpts } from "./filing-search-tool";

const AskLlmSchema = z.object({
  answer: z.string().min(12),
  citations: z.array(z.string().min(2)).min(1).max(6),
});

const BUY_SELL_TRAP_RE =
  /(明天|下周|今天)?(能买吗|能卖吗|会涨吗|会跌吗|给个目标价|预测股价|几倍杠杆)/;

function computeAskContext(thesis: ThesisDetail, secSnapshot: SecSnapshot | null) {
  const annuals = secSnapshot?.annuals ?? [];
  const quality = analyzeSecQuality(annuals);
  const forensics = analyzeSecForensics(annuals, secSnapshot?.quarterlies ?? []);
  const exp = calculateImpliedExpectations({
    summary: thesis.valuation,
    trailingEps: quality?.latestEps,
  });
  const baseEps =
    quality?.latestEps && quality.latestEps > 0
      ? quality.latestEps
      : Math.max(0.5, thesis.currentPrice / 22);
  const rdcf = calculateTrueReverseDcf({
    currentPrice: thesis.currentPrice,
    baseMetricPerShare: baseEps,
    horizonYears: Math.max(3, thesis.horizonYears),
    hurdleRatePct: 15,
    terminalMultiple: thesis.valuation.base.peMultiple,
  });
  return { forensics, exp, rdcf };
}

function buildDeterministicAskResponse(params: {
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
  question: string;
  cachedFilings?: readonly SecFilingReaderResponse[];
  researchNotes?: readonly ResearchNote[];
  sourceText?: string;
}): Omit<AgentAskResponse, "engine" | "fallbackReason"> {
  const { thesis, secSnapshot, question } = params;
  if (BUY_SELL_TRAP_RE.test(question)) {
    return {
      answer:
        "KANON 投委会拒绝提供短期涨跌预测或买卖喊单。请围绕可证伪假设、安全边际与零杠杆离场条件进行压力测试（例如询问毛利率下修对买点的影响或 10-K 风险措辞变动）。",
      citations: ["KANON 买方投研铁律 · Non-Goals"],
    };
  }
  const { forensics, exp, rdcf } = computeAskContext(thesis, secSnapshot);
  const hits = searchFilingExcerpts({
    query: `${question} ${thesis.ticker} ${thesis.businessFilter.keyDebate}`,
    filings: params.cachedFilings,
    researchNotes: params.researchNotes,
    sourceText: params.sourceText,
    limit: 2,
  });
  const excerptBlock =
    hits.length > 0
      ? `\n\n一阶原文相关段落：\n${hits.map((h) => `• [${h.citation}] ${h.text.slice(0, 180)}…`).join("\n")}`
      : "";
  const forensicPart = forensics
    ? `SEC 法证评分 ${forensics.forensicScore}/100（ROIC ${forensics.roicPct ?? "—"}%，SBC/OCF ${forensics.sbcPctOfOcf ?? "—"}%）。`
    : "暂缺多年度 SEC 财报数据。";

  return {
    answer: `${thesis.companyName} (${thesis.ticker}) 当前价 $${thesis.currentPrice.toFixed(2)}，中性目标 $${thesis.valuation.base.targetPrice.toFixed(1)}（15% 年化安全买点 $${exp.hurdleEntry15.toFixed(1)}，安全边际 ${exp.marginOfSafetyPct}%，Reverse-DCF 隐含增速 ${rdcf.requiredCagrPct}%）。${forensicPart}${excerptBlock}`,
    citations: [
      `${thesis.ticker} 三情景估值与 Reverse-DCF`,
      ...(forensics ? [`SEC ${forensics.latestFiscalYear} 财务法证`] : []),
      ...hits.map((h) => h.citation),
    ].slice(0, 6),
  };
}

export async function askResearchIc(params: {
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
  question: string;
  cachedFilings?: readonly SecFilingReaderResponse[];
  researchNotes?: readonly ResearchNote[];
  sourceText?: string;
  byok?: ByokCredentials;
}): Promise<AgentAskResponse> {
  const local = buildDeterministicAskResponse(params);
  if (BUY_SELL_TRAP_RE.test(params.question)) {
    return AgentAskResponseSchema.parse({ ...local, engine: "grounded-local" });
  }
  const model = resolveByokModel(params.byok);
  if (!model) {
    return AgentAskResponseSchema.parse({ ...local, engine: "grounded-local" });
  }
  try {
    const res = await generateObject({
      model,
      schema: AskLlmSchema,
      system:
        "你是 KANON 买方投委会质询助理。严禁给出短期买卖建议或股价预测，严禁编造任何未提供的数字；仅基于以下确定性估值锚点与 SEC 原文摘要回答用户的压力测试问题（简体中文，精炼克制）。",
      prompt: `标的：${params.thesis.companyName} (${params.thesis.ticker})\n确定性事实与检索摘要：\n${local.answer}\n\n核心争论：${params.thesis.businessFilter.keyDebate || "未填"}\n逆向推演：${params.thesis.businessFilter.preMortem || "未填"}\n\n用户质询：${params.question}`,
    });
    return AgentAskResponseSchema.parse({
      answer: res.object.answer,
      citations: res.object.citations,
      engine: "vercel-ai-sdk",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 60) : "模型超时";
    return AgentAskResponseSchema.parse({
      ...local,
      engine: "grounded-local",
      fallbackReason: `BYOK 质询异常（${msg}），已自动切换确定性证据回答`,
    });
  }
}
