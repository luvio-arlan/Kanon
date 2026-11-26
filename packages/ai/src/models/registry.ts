import type { ByokProvider } from "@kanon/core";

export type ModelTier = "fast" | "reasoning";

export interface ModelPricingSpec {
  id: string;
  provider: ByokProvider;
  tier: ModelTier;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
}

export const AI_MODEL_REGISTRY: readonly ModelPricingSpec[] = [
  {
    id: "gemini-2.5-flash",
    provider: "gemini",
    tier: "fast",
    inputUsdPer1M: 0.15,
    outputUsdPer1M: 0.6,
  },
  {
    id: "gemini-2.5-pro",
    provider: "gemini",
    tier: "reasoning",
    inputUsdPer1M: 1.25,
    outputUsdPer1M: 10.0,
  },
  {
    id: "claude-sonnet-4-5",
    provider: "anthropic",
    tier: "fast",
    inputUsdPer1M: 3.0,
    outputUsdPer1M: 15.0,
  },
  {
    id: "claude-opus-4-1",
    provider: "anthropic",
    tier: "reasoning",
    inputUsdPer1M: 15.0,
    outputUsdPer1M: 75.0,
  },
  {
    id: "gpt-4.1-mini",
    provider: "openai",
    tier: "fast",
    inputUsdPer1M: 0.4,
    outputUsdPer1M: 1.6,
  },
  {
    id: "gpt-4.1",
    provider: "openai",
    tier: "reasoning",
    inputUsdPer1M: 2.0,
    outputUsdPer1M: 8.0,
  },
  {
    id: "deepseek-chat",
    provider: "openai_compatible",
    tier: "fast",
    inputUsdPer1M: 0.27,
    outputUsdPer1M: 1.1,
  },
  {
    id: "deepseek-reasoner",
    provider: "openai_compatible",
    tier: "reasoning",
    inputUsdPer1M: 0.55,
    outputUsdPer1M: 2.19,
  },
];

export function resolveDefaultModelId(provider: ByokProvider, tier: ModelTier = "fast"): string {
  const match = AI_MODEL_REGISTRY.find((m) => m.provider === provider && m.tier === tier);
  return match?.id ?? "gemini-2.5-flash";
}

export function estimateTokenCostUsd(params: {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
}): number {
  const spec = AI_MODEL_REGISTRY.find((m) => m.id === params.modelId);
  const inRate = spec?.inputUsdPer1M ?? 1.0;
  const outRate = spec?.outputUsdPer1M ?? 4.0;
  const usd = (params.promptTokens * inRate + params.completionTokens * outRate) / 1_000_000;
  return Math.round(usd * 100_000) / 100_000;
}
