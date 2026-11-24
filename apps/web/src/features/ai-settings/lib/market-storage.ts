import {
  type LocalMarketConfig,
  LocalMarketConfigSchema,
  type MarketProviderPreference,
  type MarketProviderTestResponse,
  MarketProviderTestResponseSchema,
} from "@kanon/core";
import { kanonFetch, parseValidatedJson } from "@/shared/lib/kanon-fetch";

const MARKET_STORAGE_KEY = "kanon-market-provider-config";

export function readMarketConfig(): LocalMarketConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MARKET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseValidatedJson(raw, LocalMarketConfigSchema);
    return parsed.ok ? parsed.data : null;
  } catch (err) {
    void err;
    return null;
  }
}

export function writeMarketConfig(config: LocalMarketConfig | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (!config || (config.provider === "auto" && !config.apiKey.trim())) {
      window.localStorage.removeItem(MARKET_STORAGE_KEY);
      return true;
    }
    window.localStorage.setItem(
      MARKET_STORAGE_KEY,
      JSON.stringify({ provider: config.provider, apiKey: config.apiKey.trim() }),
    );
    return true;
  } catch (err) {
    void err;
    return false;
  }
}

export function buildMarketHeaders(): Record<string, string> {
  const cfg = readMarketConfig();
  if (!cfg) return {};
  const headers: Record<string, string> = { "x-kanon-market-provider": cfg.provider };
  if (cfg.apiKey.trim()) headers["x-kanon-market-key"] = cfg.apiKey.trim();
  return headers;
}

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
