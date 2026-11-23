import type { EarningsDigest, InvestmentMemo, RedTeamReport } from "@kanon/ai";
import type {
  CreateDisciplineEntryInput,
  SecSnapshot,
  ThesisDetail,
  UpdateThesisStepInput,
} from "@kanon/core";
import { toast } from "sonner";
import { buildByokHeaders } from "../lib/byok-storage";

export type CopilotKind = "earnings_digest" | "red_team" | "investment_memo";

export type CopilotResult =
  | { action: "red_team"; data: RedTeamReport }
  | { action: "earnings_digest"; data: EarningsDigest }
  | { action: "investment_memo"; data: InvestmentMemo };

type CopilotApiResponse =
  | { engine?: string; action: "red_team"; data: RedTeamReport; error?: string }
  | { engine?: string; action: "earnings_digest"; data: EarningsDigest; error?: string }
  | { engine?: string; action: "investment_memo"; data: InvestmentMemo; error?: string }
  | { engine?: string; action?: CopilotKind; data?: undefined; error?: string };

async function sendJson<T>(
  url: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
  extraHeaders?: Record<string, string>,
) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: (await res.json()) as T };
}

export async function apiPatchStep(
  thesisId: string,
  payload: UpdateThesisStepInput,
  okMessage: string,
): Promise<ThesisDetail | null> {
  const { ok, json } = await sendJson<{ thesis?: ThesisDetail; error?: string }>(
    `/api/theses/${thesisId}`,
    payload,
    "PATCH",
  );
  if (!ok || !json.thesis) {
    toast.error(json.error ?? "保存失败，请重试");
    return null;
  }
  toast.success(okMessage);
  return json.thesis;
}

export async function apiPostDiscipline(
  thesisId: string,
  entry: CreateDisciplineEntryInput,
): Promise<ThesisDetail | null> {
  const { ok, json } = await sendJson<{ thesis?: ThesisDetail; error?: string }>(
    `/api/theses/${thesisId}/discipline`,
    entry,
  );
  if (!ok || !json.thesis) {
    toast.error(json.error ?? "纪律检查未通过");
    return null;
  }
  toast.success("交易纪律复盘卡已落库");
  return json.thesis;
}

export async function apiSyncSec(ticker: string): Promise<SecSnapshot | null> {
  const res = await fetch(`/api/sec/${ticker}`, { method: "POST" });
  const json = (await res.json()) as { snapshot?: SecSnapshot | null; notice?: string };
  toast(json.notice ?? "SEC 同步完成");
  return json.snapshot ?? null;
}

function toCopilotResult(json: CopilotApiResponse): CopilotResult | null {
  if (!json.data || !json.action) return null;
  if (json.action === "red_team") return { action: "red_team", data: json.data };
  if (json.action === "earnings_digest") return { action: "earnings_digest", data: json.data };
  return { action: "investment_memo", data: json.data };
}

export async function apiRunCopilot(
  thesisId: string,
  action: CopilotKind,
  sourceText?: string,
): Promise<CopilotResult | null> {
  const trimmed = sourceText?.trim();
  const payload = trimmed ? { thesisId, action, sourceText: trimmed } : { thesisId, action };
  const { ok, json } = await sendJson<CopilotApiResponse>(
    "/api/ai/copilot",
    payload,
    "POST",
    buildByokHeaders(),
  );
  const parsed = ok ? toCopilotResult(json) : null;
  if (!parsed) {
    toast.error(json.error ?? "投研副驾驶运行失败");
    return null;
  }
  toast.success(
    json.engine === "vercel-ai-sdk"
      ? "已完成 BYOK 模型结构化分析并落库"
      : "已基于一阶档案生成分析并落库",
  );
  return parsed;
}

export async function apiDeleteThesis(thesisId: string): Promise<boolean> {
  const res = await fetch(`/api/theses/${thesisId}`, { method: "DELETE" });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    toast.error(json.error ?? "删除标的失败，请重试");
    return false;
  }
  toast.success("已从投研档案中删除该标的");
  return true;
}
