import {
  type MarketProviderPreference,
  type MarketProviderTestResponse,
  MarketProviderTestResponseSchema,
} from "@kanon/core";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export async function apiTestMarketProvider(params: {
  provider: MarketProviderPreference;
  apiKey?: string;
  ticker?: string;
}): Promise<MarketProviderTestResponse | null> {
  const res = await kanonFetch("/api/market/provider-test", MarketProviderTestResponseSchema, {
    method: "POST",
    body: params,
    fallbackError: "行情接口连通性检测失败",
  });
  return res.ok ? res.data : null;
}
