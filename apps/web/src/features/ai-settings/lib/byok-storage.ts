import { type LocalByokConfig, LocalByokConfigSchema } from "@kanon/core";
import { parseValidatedJson } from "@/shared/lib/kanon-fetch";

export type { LocalByokConfig };

const STORAGE_KEY = "kanon-byok-config";

export function readByokConfig(): LocalByokConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
      window.localStorage.removeItem(STORAGE_KEY);
      return true;
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ provider: config.provider, apiKey: config.apiKey.trim() }),
    );
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
  };
}
