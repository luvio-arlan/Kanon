import {
  type MarketDataSource,
  type MarketProviderPreference,
  type MarketProviderTier,
  type MarketQuoteSnapshot,
  type MarketSessionState,
  roundTo,
} from "@kanon/core";

export interface MarketAdapterCredentials {
  provider?: MarketProviderPreference;
  apiKey?: string;
}

export type MarketSnapshotResult =
  | { ok: true; quote: MarketQuoteSnapshot }
  | { ok: false; ticker: string; source: MarketDataSource; reason: string };

export interface MarketDataAdapter {
  readonly id: MarketDataSource;
  readonly tier: MarketProviderTier;
  readonly supportsExtendedHours: boolean;
  fetchQuote: (
    ticker: string,
    apiKey: string | undefined,
    fetchImpl: typeof fetch,
  ) => Promise<MarketSnapshotResult>;
}

export function computePriceDelta(
  current: number | null,
  reference: number | null,
): { change: number | null; changePct: number | null } {
  if (current === null || reference === null || reference <= 0) {
    return { change: null, changePct: null };
  }
  const change = roundTo(current - reference, 2);
  const changePct = roundTo(((current - reference) / reference) * 100, 2);
  return { change, changePct };
}

export function computeRangePositionPct(
  price: number,
  low: number | null,
  high: number | null,
): number | null {
  if (low === null || high === null || high <= low) return null;
  const raw = ((price - low) / (high - low)) * 100;
  return roundTo(Math.min(100, Math.max(0, raw)), 1);
}

export function resolveEffectivePrice(params: {
  sessionState: MarketSessionState;
  regularPrice: number;
  preMarketPrice: number | null;
  postMarketPrice: number | null;
}): number {
  if (params.sessionState === "PRE" && params.preMarketPrice !== null) {
    return params.preMarketPrice;
  }
  if (params.sessionState === "POST" && params.postMarketPrice !== null) {
    return params.postMarketPrice;
  }
  return params.regularPrice;
}
