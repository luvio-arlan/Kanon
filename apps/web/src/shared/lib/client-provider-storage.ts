import {
  type LocalByokConfig,
  LocalByokConfigSchema,
  type LocalMarketConfig,
  LocalMarketConfigSchema,
} from "@kanon/core";
import { parseValidatedJson } from "./kanon-fetch";

const BYOK_STORAGE_KEY = "kanon-byok-config";
const MARKET_STORAGE_KEY = "kanon-market-provider-config";

export function readByokConfig(): LocalByokConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseValidatedJson(raw, LocalByokConfigSchema);
    return parsed.ok ? parsed.data : null;
  } catch (err) {
    void err;
    return null;
  }
}

export function writeByokConfig(config: LocalByokConfig | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (!config?.apiKey.trim()) {
      window.localStorage.removeItem(BYOK_STORAGE_KEY);
      return true;
    }
    const payload: LocalByokConfig = {
      provider: config.provider,
      apiKey: config.apiKey.trim(),
      ...(config.model?.trim() ? { model: config.model.trim() } : {}),
      ...(config.baseUrl?.trim() ? { baseUrl: config.baseUrl.trim() } : {}),
    };
    window.localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    void err;
    return false;
  }
}

export function buildByokHeaders(): Record<string, string> {
  const cfg = readByokConfig();
  if (!cfg) return {};
  return {
    "x-kanon-ai-provider": cfg.provider,
    "x-kanon-ai-key": cfg.apiKey,
    ...(cfg.model ? { "x-kanon-ai-model": cfg.model } : {}),
    ...(cfg.baseUrl ? { "x-kanon-ai-base-url": cfg.baseUrl } : {}),
  };
}

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
