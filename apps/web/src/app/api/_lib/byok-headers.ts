import { type ByokCredentials, ByokProviderSchema } from "@kanon/ai";
import { type KanonDb, resolveUserAiCredential } from "@kanon/core/db";

const PROVIDER_FALLBACK_ORDER = ["gemini", "anthropic", "openai", "openai_compatible"] as const;

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

/**
 * Resolves BYOK credentials from request headers first, then falls back to
 * the user's server-side AES-256-GCM encrypted `user_ai_credentials` vault.
 */
export async function resolveEffectiveByok(
  db: KanonDb,
  userId: string,
  request: Request,
): Promise<ByokCredentials | undefined> {
  const fromHeaders = parseByokHeaders(request);
  if (fromHeaders) return fromHeaders;
  const preferred = request.headers.get("x-kanon-ai-provider");
  const candidates =
    preferred && ByokProviderSchema.safeParse(preferred).success
      ? [preferred as (typeof PROVIDER_FALLBACK_ORDER)[number], ...PROVIDER_FALLBACK_ORDER]
      : [...PROVIDER_FALLBACK_ORDER];
  for (const provider of new Set(candidates)) {
    const stored = await resolveUserAiCredential(db, userId, provider);
    if (stored) {
      return {
        provider,
        apiKey: stored.apiKey,
        model: stored.defaultModel ?? undefined,
        baseUrl: stored.baseUrl ?? undefined,
      };
    }
  }
  return undefined;
}

export async function meterAiRouteUsage(params: {
  db: KanonDb;
  userId: string;
  thesisId: string;
  route: string;
  engine: string;
  byok?: ByokCredentials;
}): Promise<void> {
  const { recordAiUsage } = await import("@kanon/core/db");
  await recordAiUsage(params.db, {
    userId: params.userId,
    thesisId: params.thesisId,
    route: params.route,
    provider: params.byok?.provider ?? params.engine,
    model: params.byok?.model ?? params.engine,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
  }).catch(() => undefined);
}
