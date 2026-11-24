import {
  CopilotApiResponseSchema,
  type CreateDisciplineEntryInput,
  DeleteOkResponseSchema,
  type EarningsDigest,
  type InvestmentMemo,
  type RedTeamReport,
  type SecSnapshot,
  SecSyncResponseSchema,
  type ThesisDetail,
  ThesisMutationResponseSchema,
  type ThesisRevision,
  type UpdateThesisStepInput,
} from "@kanon/core";
import { toast } from "sonner";
import { buildByokHeaders } from "@/features/ai-settings";
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

export async function apiPatchStep(
  thesisId: string,
  payload: UpdateThesisStepInput,
  okMessage: string,
): Promise<ThesisMutationResult | null> {
  const res = await kanonFetch(`/api/theses/${thesisId}`, ThesisMutationResponseSchema, {
    method: "PATCH",
    body: payload,
    fallbackError: "保存失败，请重试",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  toast.success(okMessage);
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
  toast.success("交易纪律复盘卡已落库");
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
    toast.success("已完成 BYOK 模型结构化分析并落库");
  } else if (data.fallbackReason) {
    toast.warning(`已降级为本地一阶分析（${data.fallbackReason}）`);
  } else {
    toast.success("已基于一阶档案生成分析并落库");
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
