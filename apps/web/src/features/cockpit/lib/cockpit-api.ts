import type { ThesisDetail } from "@kanon/core";
import { toast } from "sonner";

export interface NewThesisDraft {
  ticker: string;
  companyName: string;
  sectorTag: string;
  currentPrice: string;
  convictionSummary: string;
}

export async function apiCreateThesis(draft: NewThesisDraft): Promise<ThesisDetail | null> {
  const priceNum = Number(draft.currentPrice);
  if (
    !draft.ticker.trim() ||
    !draft.companyName.trim() ||
    !draft.sectorTag.trim() ||
    priceNum <= 0
  ) {
    toast.error("请完整填写美股代码、公司名称、赛道与参考价");
    return null;
  }
  const res = await fetch("/api/theses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: draft.ticker.trim().toUpperCase(),
      companyName: draft.companyName.trim(),
      sectorTag: draft.sectorTag.trim(),
      currentPrice: priceNum,
      convictionSummary: draft.convictionSummary.trim() || undefined,
    }),
  });
  const json = (await res.json()) as { thesis?: ThesisDetail; error?: string };
  if (!res.ok || !json.thesis) {
    toast.error(json.error ?? "创建标的失败");
    return null;
  }
  toast.success(`已新建 ${json.thesis.companyName} (${json.thesis.ticker}) 研究档案`);
  return json.thesis;
}
