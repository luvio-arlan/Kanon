import type { ByokProvider } from "@kanon/ai";

export interface LocalByokConfig {
  provider: ByokProvider;
  apiKey: string;
}

const STORAGE_KEY = "kanon-byok-config";

export function readByokConfig(): LocalByokConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalByokConfig>;
    if (
      (parsed.provider === "gemini" ||
        parsed.provider === "anthropic" ||
        parsed.provider === "openai") &&
      typeof parsed.apiKey === "string" &&
      parsed.apiKey.trim().length > 0
    ) {
      return { provider: parsed.provider, apiKey: parsed.apiKey.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeByokConfig(config: LocalByokConfig | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!config?.apiKey.trim()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ provider: config.provider, apiKey: config.apiKey.trim() }),
    );
  } catch {
    // Ignore restricted storage errors
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
