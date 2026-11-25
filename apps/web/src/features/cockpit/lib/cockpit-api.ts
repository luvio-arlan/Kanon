import {
  CreateThesisResponseSchema,
  type MarketBootstrapResponse,
  MarketBootstrapResponseSchema,
  type MarketQuoteSnapshot,
  RefreshPricesResponseSchema,
  type SparklinePoint,
  type ThesisDetail,
  ThesisMutationResponseSchema,
} from "@kanon/core";
import { toast } from "sonner";
import { buildMarketHeaders } from "@/shared/lib/client-provider-storage";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export interface NewThesisDraft {
  ticker: string;
  companyName: string;
  sectorTag: string;
  currentPrice: string;
  convictionSummary: string;
  latestSecEps?: number;
  priceHistory?: SparklinePoint[];
}

export const INSTITUTIONAL_THESIS_PRESETS: readonly NewThesisDraft[] = [
  {
    ticker: "TSM",
    companyName: "台积电",
    sectorTag: "晶圆代工 · 先进封装",
    currentPrice: "192",
    convictionSummary:
      "3nm/2nm 先进制程绝对垄断叠加 CoWoS 封装产能稀缺，具备跨周期提价权与强劲自由现金流。",
  },
  {
    ticker: "MSFT",
    companyName: "微软",
    sectorTag: "企业软件 · Azure 云",
    currentPrice: "425",
    convictionSummary:
      "企业级生产力套件高复购护城河稳固，Azure AI 云工作负载加速变现，资本配置与治理全球标杆。",
  },
  {
    ticker: "ASML",
    companyName: "阿斯麦",
    sectorTag: "半导体设备 · EUV 光刻",
    currentPrice: "715",
    convictionSummary:
      "全球唯一 EUV 与 High-NA 光刻机供应商，设备装机后高毛利维保与升级服务形成高粘性经常性现金流。",
  },
  {
    ticker: "COST",
    companyName: "开市客",
    sectorTag: "会员零售 · 供应链效率",
    currentPrice: "910",
    convictionSummary:
      "会员费贡献核心净利且续费率超 92%，极致 SKU 精选与规模反哺形成不可复制的低价飞轮。",
  },
  {
    ticker: "META",
    companyName: "Meta Platforms",
    sectorTag: "数字广告 · 开源 AI",
    currentPrice: "585",
    convictionSummary:
      "超 32 亿日活社交生态结合 AI 推荐与广告投放提效，高利润率支撑持续算力投入与股票回购。",
  },
];

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
  const res = await kanonFetch("/api/theses", CreateThesisResponseSchema, {
    method: "POST",
    body: {
      ticker: draft.ticker.trim().toUpperCase(),
      companyName: draft.companyName.trim(),
      sectorTag: draft.sectorTag.trim(),
      currentPrice: priceNum,
      convictionSummary: draft.convictionSummary.trim() || undefined,
      latestSecEps: draft.latestSecEps,
      priceHistory: draft.priceHistory,
    },
    fallbackError: "创建标的失败",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  toast.success(`已新建 ${res.data.thesis.companyName} (${res.data.thesis.ticker}) 研究档案`);
  return res.data.thesis;
}

export async function apiBootstrapTicker(ticker: string): Promise<MarketBootstrapResponse | null> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) {
    toast.error("请先输入美股代码（如 AVGO / COST）");
    return null;
  }
  const res = await kanonFetch(
    `/api/market/bootstrap?ticker=${encodeURIComponent(clean)}`,
    MarketBootstrapResponseSchema,
    { headers: buildMarketHeaders(), fallbackError: "自动识别美股档案失败，可继续手工填写" },
  );
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  toast.success(res.data.notice);
  return res.data;
}

export async function apiRefreshClosingPrices(
  mode: "regular" | "extended" = "extended",
): Promise<{ theses: ThesisDetail[]; quotes?: Record<string, MarketQuoteSnapshot> } | null> {
  const res = await kanonFetch("/api/market/refresh-prices", RefreshPricesResponseSchema, {
    method: "POST",
    headers: buildMarketHeaders(),
    body: { mode },
    fallbackError: "行情校准失败，已保留原参考价",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  if (res.data.updatedCount > 0) toast.success(res.data.notice);
  else toast(res.data.notice);
  return { theses: res.data.updatedTheses, quotes: res.data.quotes };
}

export async function apiCalibratePriceAnchor(
  thesisId: string,
  currentPrice: number,
): Promise<ThesisDetail | null> {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    toast.error("请输入有效的正数参考价");
    return null;
  }
  const res = await kanonFetch(`/api/theses/${thesisId}`, ThesisMutationResponseSchema, {
    method: "PATCH",
    body: { step: "price_anchor", currentPrice },
    fallbackError: "校准参考价失败",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  toast.success(
    `已将 ${res.data.thesis.ticker} 参考价校准至 $${res.data.thesis.currentPrice.toFixed(2)}`,
  );
  return res.data.thesis;
}
