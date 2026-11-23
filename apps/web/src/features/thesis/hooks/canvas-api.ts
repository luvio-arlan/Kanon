import type { EarningsDigest, RedTeamReport, VideoScript } from "@kanon/ai";
import type {
  CreateDisciplineEntryInput,
  SecSnapshot,
  ThesisDetail,
  UpdateThesisStepInput,
} from "@kanon/core";
import { toast } from "sonner";

export type CopilotKind = "earnings_digest" | "red_team" | "video_script";
export type CopilotData = EarningsDigest | RedTeamReport | VideoScript;

async function postJson<T>(url: string, body: unknown, method: "POST" | "PATCH" = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: (await res.json()) as T };
}

export async function apiPatchStep(
  thesisId: string,
  payload: UpdateThesisStepInput,
  okMessage: string,
): Promise<ThesisDetail | null> {
  const { ok, json } = await postJson<{ thesis?: ThesisDetail; error?: string }>(
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
  const { ok, json } = await postJson<{ thesis?: ThesisDetail; error?: string }>(
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

export async function apiRunCopilot(
  thesisId: string,
  action: CopilotKind,
): Promise<CopilotData | null> {
  const { ok, json } = await postJson<{ engine?: string; data?: CopilotData; error?: string }>(
    "/api/ai/copilot",
    { thesisId, action },
  );
  if (!ok || !json.data) {
    toast.error(json.error ?? "副驾驶运行失败");
    return null;
  }
  toast.success(
    json.engine === "vercel-ai-sdk" ? "已完成 AI 结构化分析" : "已基于一阶档案生成结构化分析",
  );
  return json.data;
}
