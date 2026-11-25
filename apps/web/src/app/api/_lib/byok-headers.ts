import { type ByokCredentials, ByokProviderSchema } from "@kanon/ai";

export function parseByokHeaders(request: Request): ByokCredentials | undefined {
  const rawProvider = request.headers.get("x-kanon-ai-provider");
  const apiKey = request.headers.get("x-kanon-ai-key")?.trim();
  if (!rawProvider || !apiKey) return undefined;
  const parsed = ByokProviderSchema.safeParse(rawProvider);
  if (!parsed.success) return undefined;
  const model = request.headers.get("x-kanon-ai-model")?.trim() || undefined;
  const baseUrl = request.headers.get("x-kanon-ai-base-url")?.trim() || undefined;
  return { provider: parsed.data, apiKey, model, baseUrl };
}
