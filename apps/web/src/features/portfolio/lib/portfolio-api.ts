import {
  type PortfolioCalibrationReport,
  PortfolioCalibrationResponseSchema,
  type PortfolioRole,
  ThesisArchiveImportRequestSchema,
  ThesisArchiveImportResponseSchema,
  type ThesisDetail,
  ThesisMutationResponseSchema,
  type WeeklyIcDigest,
} from "@kanon/core";
import { toast } from "sonner";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export interface PositionUpdatePayload {
  portfolioRole: PortfolioRole;
  currentWeightPct: number;
  targetMaxWeightPct: number;
  avgCostBasis: number | null;
}

export async function apiUpdatePortfolioPosition(
  thesisId: string,
  payload: PositionUpdatePayload,
): Promise<ThesisDetail | null> {
  const res = await kanonFetch(`/api/theses/${thesisId}`, ThesisMutationResponseSchema, {
    method: "PATCH",
    body: { step: "portfolio", ...payload },
    fallbackError: "保存组合仓位失败",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  toast.success(`已更新 ${res.data.thesis.ticker} 组合仓位至 ${res.data.thesis.currentWeightPct}%`);
  return res.data.thesis;
}

export async function apiImportThesisArchive(
  rawJsonText: string,
  mode: "create_copy" | "overwrite",
): Promise<{ thesis: ThesisDetail; mode: "create_copy" | "overwrite" } | null> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawJsonText);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "格式错误";
    toast.error(`JSON 解析失败：${detail}`);
    return null;
  }

  const candidate = { archive: decoded, mode };
  const validated = ThesisArchiveImportRequestSchema.safeParse(candidate);
  if (!validated.success) {
    toast.error("导入失败：请提供 KANON 导出的 archive.json 文件。");
    return null;
  }

  const res = await kanonFetch("/api/import/thesis", ThesisArchiveImportResponseSchema, {
    method: "POST",
    body: validated.data,
    fallbackError: "导入研究档案失败",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  const verb = res.data.mode === "overwrite" ? "覆盖更新" : "导入新建";
  toast.success(`已${verb} ${res.data.thesis.companyName} (${res.data.thesis.ticker})`);
  return res.data;
}

export async function apiGetPortfolioCalibration(): Promise<{
  calibration: PortfolioCalibrationReport;
  digest: WeeklyIcDigest;
} | null> {
  const res = await kanonFetch("/api/portfolio/calibration", PortfolioCalibrationResponseSchema, {
    fallbackError: "加载组合认知校准失败",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  return res.data;
}
