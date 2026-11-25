import {
  AgentApplyResponseSchema,
  type AgentAskResponse,
  AgentAskResponseSchema,
  AgentRunsListResponseSchema,
  CopilotApiResponseSchema,
  type CreateDisciplineEntryInput,
  type CreateQuarterlyReviewInput,
  DeleteOkResponseSchema,
  type EarningsDigest,
  type InvestmentMemo,
  type QuarterlyReview,
  QuarterlyReviewCreateResponseSchema,
  type RedTeamReport,
  type SavedAgentRun,
  type SecSnapshot,
  SecSyncResponseSchema,
  type ThesisDetail,
  ThesisMutationResponseSchema,
  type ThesisRevision,
  type UpdateThesisStepInput,
} from "@kanon/core";
import { toast } from "sonner";
import { buildByokHeaders } from "@/shared/lib/client-provider-storage";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export type CopilotKind = "earnings_digest" | "red_team" | "investment_memo";

export type CopilotResult =
  | { action: "red_team"; data: RedTeamReport }
  | { action: "earnings_digest"; data: EarningsDigest }
  | { action: "investment_memo"; data: InvestmentMemo };

export interface ThesisMutationResult {
  thesis: ThesisDetail;
  revisions?: ThesisRevision[];
}

export type StepPatchOutcome =
  | { kind: "ok"; thesis: ThesisDetail; revisions?: ThesisRevision[] }
  | { kind: "conflict" }
  | { kind: "error" };

export async function apiPatchStep(
  thesisId: string,
  payload: UpdateThesisStepInput,
  okMessage?: string,
  options?: { silent?: boolean; expectedUpdatedAt?: string },
): Promise<StepPatchOutcome> {
  const body = options?.expectedUpdatedAt
    ? { ...payload, expectedUpdatedAt: options.expectedUpdatedAt }
    : payload;
  const res = await kanonFetch(`/api/theses/${thesisId}`, ThesisMutationResponseSchema, {
    method: "PATCH",
    body,
    fallbackError: "保存失败，请重试",
    timeoutMs: 15_000,
  });
  if (!res.ok) {
    toast.error(res.error);
    return res.status === 409 ? { kind: "conflict" } : { kind: "error" };
  }
  if (!options?.silent && okMessage) {
    toast.success(okMessage);
  }
  return { kind: "ok", thesis: res.data.thesis, revisions: res.data.revisions };
}

export async function apiGetThesis(thesisId: string): Promise<ThesisMutationResult | null> {
  const res = await kanonFetch(`/api/theses/${thesisId}`, ThesisMutationResponseSchema, {
    fallbackError: "同步最新研究档案失败",
    timeoutMs: 12_000,
  });
  if (!res.ok) return null;
  return { thesis: res.data.thesis, revisions: res.data.revisions };
}

export async function apiPostDiscipline(
  thesisId: string,
  entry: CreateDisciplineEntryInput,
): Promise<ThesisMutationResult | null> {
  const res = await kanonFetch(`/api/theses/${thesisId}/discipline`, ThesisMutationResponseSchema, {
    method: "POST",
    body: entry,
    fallbackError: "纪律检查未通过",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  toast.success("交易纪律复盘卡已保存");
  return { thesis: res.data.thesis, revisions: res.data.revisions };
}

export async function apiSyncSec(ticker: string): Promise<SecSnapshot | null> {
  const res = await kanonFetch(`/api/sec/${ticker}`, SecSyncResponseSchema, {
    method: "POST",
    fallbackError: "SEC 同步失败，保留本地缓存",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  toast(res.data.notice ?? "SEC 同步完成");
  return res.data.snapshot;
}

export async function apiRunCopilot(
  thesisId: string,
  action: CopilotKind,
  sourceText?: string,
): Promise<CopilotResult | null> {
  const trimmed = sourceText?.trim();
  const payload = trimmed ? { thesisId, action, sourceText: trimmed } : { thesisId, action };
  const res = await kanonFetch("/api/ai/copilot", CopilotApiResponseSchema, {
    method: "POST",
    body: payload,
    headers: buildByokHeaders(),
    fallbackError: "投研副驾驶运行失败",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  const { data } = res;
  if (data.engine === "vercel-ai-sdk") {
    toast.success("已完成 BYOK 模型结构化分析并保存");
  } else if (data.fallbackReason) {
    toast.warning(`已降级为本地一阶分析（${data.fallbackReason}）`);
  } else {
    toast.success("已基于一阶档案生成分析并保存");
  }
  if (data.action === "red_team") return { action: "red_team", data: data.data };
  if (data.action === "earnings_digest") return { action: "earnings_digest", data: data.data };
  return { action: "investment_memo", data: data.data };
}

export async function apiDeleteThesis(thesisId: string): Promise<boolean> {
  const res = await kanonFetch(`/api/theses/${thesisId}`, DeleteOkResponseSchema, {
    method: "DELETE",
    fallbackError: "删除标的失败，请重试",
  });
  if (!res.ok) {
    toast.error(res.error);
    return false;
  }
  toast.success("已从投研档案中删除该标的");
  return true;
}

export async function apiCreateQuarterlyReview(
  thesisId: string,
  input: CreateQuarterlyReviewInput,
): Promise<{ thesis: ThesisDetail; review: QuarterlyReview; revisions: ThesisRevision[] } | null> {
  const res = await kanonFetch(
    `/api/theses/${thesisId}/reviews`,
    QuarterlyReviewCreateResponseSchema,
    { method: "POST", body: input, fallbackError: "保存季度复盘失败" },
  );
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  toast.success(`${input.quarterLabel} 季度复盘已沉淀归档`);
  return res.data;
}

export async function apiApplyAgentProposals(
  runId: string,
  proposalIds: readonly string[],
): Promise<{
  appliedProposalIds: string[];
  thesis?: ThesisDetail;
  revisions?: ThesisRevision[];
  promotedExitRules?: string[];
} | null> {
  const res = await kanonFetch("/api/ai/agent/apply", AgentApplyResponseSchema, {
    method: "POST",
    body: { runId, proposalIds: [...proposalIds] },
    fallbackError: "采纳修订提案失败",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  return res.data;
}

export async function apiListAgentRuns(thesisId: string): Promise<SavedAgentRun[]> {
  const res = await kanonFetch(
    `/api/ai/agent?thesisId=${encodeURIComponent(thesisId)}`,
    AgentRunsListResponseSchema,
  );
  return res.ok ? res.data.runs : [];
}

export async function apiAskResearchIc(
  thesisId: string,
  question: string,
): Promise<AgentAskResponse | null> {
  const res = await kanonFetch("/api/ai/agent/ask", AgentAskResponseSchema, {
    method: "POST",
    body: { thesisId, question },
    headers: buildByokHeaders(),
    fallbackError: "投委会质询失败，请重试",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  return res.data;
}
