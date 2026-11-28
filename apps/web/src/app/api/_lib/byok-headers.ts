import { type ByokCredentials, ByokProviderSchema } from "@kanon/ai";
import { countHostedAiCallsToday, type KanonDb, resolveUserAiCredential } from "@kanon/core/db";
import { jsonError } from "./http";

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

export interface AiUsageEntry {
  userId: string;
  thesisId: string;
  route: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  keySource: "byok" | "hosted";
}

/** Computes AI usage & token cost outside DB transactions so DB writes never import @kanon/ai. */
export async function buildAiUsageEntry(params: {
  userId: string;
  thesisId: string;
  route: string;
  engine: string;
  byok?: ByokCredentials;
  usage?: { promptTokens: number; completionTokens: number };
}): Promise<AiUsageEntry> {
  const { estimateTokenCostUsd, resolveDefaultModelId } = await import("@kanon/ai");
  const model =
    params.byok?.model ??
    (params.byok?.provider ? resolveDefaultModelId(params.byok.provider) : params.engine);
  const promptTokens = Math.max(0, Math.round(params.usage?.promptTokens ?? 0));
  const completionTokens = Math.max(0, Math.round(params.usage?.completionTokens ?? 0));
  const costUsd =
    promptTokens + completionTokens > 0
      ? estimateTokenCostUsd({ modelId: model, promptTokens, completionTokens })
      : 0;
  return {
    userId: params.userId,
    thesisId: params.thesisId,
    route: params.route,
    provider: params.byok?.provider ?? params.engine,
    model,
    promptTokens,
    completionTokens,
    costUsd,
    keySource: params.byok ? "byok" : "hosted",
  };
}

const DEFAULT_HOSTED_DAILY_CALLS = 20;

function hostedDailyLimit(): number {
  const raw = Number(process.env.KANON_HOSTED_AI_DAILY_CALLS);
  return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_HOSTED_DAILY_CALLS;
}

/** True when KANON's own server keys can serve requests that bring no BYOK credential. */
export function isHostedAiConfigured(): boolean {
  return ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"].some((k) =>
    Boolean(process.env[k]?.trim()),
  );
}

/**
 * Hosted-AI cost gate (V2-2 / G41): requests without BYOK that would spend KANON's server keys are capped
 * at `KANON_HOSTED_AI_DAILY_CALLS` per user per UTC day (0 disables hosted). BYOK is never limited here.
 */
export async function checkHostedAiQuota(
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>,
  userId: string,
  request: Request,
  startedAt: number,
): Promise<Response | null> {
  if (!isHostedAiConfigured()) return null;
  const exceeded = await withDb(async (tx) => {
    if (await resolveEffectiveByok(tx, userId, request)) return false;
    return (await countHostedAiCallsToday(tx, userId)) >= hostedDailyLimit();
  });
  return exceeded
    ? jsonError("今日托管 AI 额度已用完，可在设置中接入自有密钥。", 429, startedAt, "HOSTED_QUOTA")
    : null;
}
