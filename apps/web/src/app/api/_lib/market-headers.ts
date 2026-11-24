import type { MarketAdapterCredentials } from "@kanon/ai";
import { MarketProviderPreferenceSchema } from "@kanon/core";

export function parseMarketHeaders(request: Request): MarketAdapterCredentials | undefined {
  const rawProvider = request.headers.get("x-kanon-market-provider")?.trim();
  const apiKey = request.headers.get("x-kanon-market-key")?.trim();
  if (!rawProvider && !apiKey) return undefined;
  const parsed = MarketProviderPreferenceSchema.safeParse(rawProvider ?? "auto");
  if (!parsed.success) return undefined;
  return {
    provider: parsed.data,
    ...(apiKey ? { apiKey } : {}),
  };
}
