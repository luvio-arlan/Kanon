import {
  analyzeSecForensics,
  analyzeSecQuality,
  type HistoricalExtrapolation,
  type IndustryPeerRow,
  type MarketBenchmarkResponse,
  MarketBenchmarkResponseSchema,
  type PeerMultipleRange,
  roundTo,
  type SecSnapshot,
  type StreetConsensus,
} from "@kanon/core";
import { PEER_CATALOG, PEER_GRAPH } from "./peer-catalog";
import { fetchMarketQuotes } from "./provider-registry";
import type { MarketAdapterCredentials } from "./types";

function selectPeerTickers(ticker: string): string[] {
  const upper = ticker.trim().toUpperCase();
  const explicit = PEER_GRAPH[upper];
  return explicit ? [...explicit] : [];
}

function buildUnavailableConsensus(): StreetConsensus {
  return {
    source: "unavailable",
    fy1RevenueB: null,
    fy2RevenueB: null,
    fy1Eps: null,
    fy2Eps: null,
    impliedForwardPe: null,
    revenueGrowthPct: null,
    epsGrowthPct: null,
    revisionTrend: "unknown",
  };
}

function computeExtrapolatedMetrics(
  currentPrice: number,
  revenue: number | null,
  trailingEps: number | null,
  clampedGrowth: number | null,
) {
  const factor = clampedGrowth !== null ? 1 + clampedGrowth / 100 : null;
  const extrapolatedFy1RevenueB =
    revenue && factor !== null ? roundTo((revenue / 1e9) * factor, 2) : null;
  const extrapolatedFy1Eps =
    trailingEps && factor !== null ? roundTo(trailingEps * factor, 2) : null;
  const impliedMultipleOnExtrapolatedEps =
    extrapolatedFy1Eps && extrapolatedFy1Eps > 0 && currentPrice > 0
      ? roundTo(currentPrice / extrapolatedFy1Eps, 1)
      : null;
  return { extrapolatedFy1RevenueB, extrapolatedFy1Eps, impliedMultipleOnExtrapolatedEps };
}

function buildHistoricalExtrapolation(
  currentPrice: number,
  secSnapshot: SecSnapshot | null,
): HistoricalExtrapolation | null {
  const annuals = secSnapshot?.annuals ?? [];
  const latest = annuals[annuals.length - 1];
  if (!latest) return null;
  const revenueCagrPct = analyzeSecQuality(annuals)?.revenueCagrPct ?? null;
  const clampedGrowth =
    revenueCagrPct !== null ? Math.max(-30, Math.min(60, revenueCagrPct)) : null;
  const trailingEps = latest.dilutedEps && latest.dilutedEps > 0 ? latest.dilutedEps : null;
  const metrics = computeExtrapolatedMetrics(
    currentPrice,
    latest.revenue,
    trailingEps,
    clampedGrowth,
  );
  if (revenueCagrPct === null && trailingEps === null) return null;
  return {
    revenueCagrPct,
    trailingEps: trailingEps !== null ? roundTo(trailingEps, 2) : null,
    ...metrics,
  };
}

function computeMedian(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function computePeerMultipleRange(
  currentPrice: number,
  secSnapshot: SecSnapshot | null,
  peers: readonly IndustryPeerRow[],
): PeerMultipleRange | null {
  const peerPes = peers
    .map((p) => p.forwardPe)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (peerPes.length < 2) return null;
  const latest = secSnapshot?.annuals[secSnapshot.annuals.length - 1];
  const currentPe =
    latest?.dilutedEps && latest.dilutedEps > 0 && currentPrice > 0
      ? roundTo(currentPrice / latest.dilutedEps, 1)
      : null;
  return {
    metricLabel: "P/E",
    current: currentPe,
    min: roundTo(peerPes[0] ?? 0, 1),
    median: roundTo(computeMedian(peerPes), 1),
    max: roundTo(peerPes[peerPes.length - 1] ?? 0, 1),
    sampleSize: peerPes.length,
  };
}

function resolvePeerMultiples(
  livePrice: number | null,
  cachedSnap: SecSnapshot | null | undefined,
  fallbackPe: number | null,
) {
  const latest = cachedSnap?.annuals[cachedSnap.annuals.length - 1];
  const marketCapB =
    livePrice && latest?.dilutedShares
      ? roundTo((livePrice * latest.dilutedShares) / 1e9, 1)
      : null;
  const trailingEps = latest?.dilutedEps && latest.dilutedEps > 0 ? latest.dilutedEps : null;
  const trailingPe = livePrice && trailingEps ? roundTo(livePrice / trailingEps, 1) : fallbackPe;
  return { marketCapB, forwardPe: trailingPe };
}

function resolvePeerSource(
  livePrice: number | null,
  cachedSnap: SecSnapshot | null | undefined,
): IndustryPeerRow["source"] {
  if (livePrice) return "live-market";
  return cachedSnap ? "sec-cached" : "curated-reference";
}

function buildPeerRow(
  peerTicker: string,
  livePrice: number | null,
  cachedSnap?: SecSnapshot | null,
): IndustryPeerRow {
  const ref = PEER_CATALOG[peerTicker];
  const quality = cachedSnap ? analyzeSecQuality(cachedSnap.annuals) : null;
  const forensics = cachedSnap
    ? analyzeSecForensics(cachedSnap.annuals, cachedSnap.quarterlies)
    : null;
  const growth = quality?.revenueCagrPct ?? ref?.revenueGrowthPct ?? null;
  const { marketCapB, forwardPe } = resolvePeerMultiples(
    livePrice,
    cachedSnap,
    ref?.forwardPe ?? null,
  );
  return {
    ticker: peerTicker,
    companyName: cachedSnap?.entityName ?? ref?.companyName ?? peerTicker,
    sector: ref?.sector ?? "行业可比",
    price: livePrice,
    marketCapB,
    revenueGrowthPct: growth,
    grossMarginPct: quality?.latestGrossMarginPct ?? ref?.grossMarginPct ?? null,
    roicPct: forensics?.roicPct ?? ref?.roicPct ?? null,
    forwardPe,
    evFcf: ref?.evFcf ?? null,
    source: resolvePeerSource(livePrice, cachedSnap),
  };
}

export async function buildMarketBenchmarks(params: {
  ticker: string;
  currentPrice: number;
  secSnapshot: SecSnapshot | null;
  cachedPeers?: ReadonlyMap<string, SecSnapshot>;
  loadCachedPeers?: (tickers: readonly string[]) => Promise<ReadonlyMap<string, SecSnapshot>>;
  creds?: MarketAdapterCredentials;
  fetchImpl?: typeof fetch;
}): Promise<MarketBenchmarkResponse> {
  const upper = params.ticker.trim().toUpperCase();
  const peerTickers = selectPeerTickers(upper);
  const [quoteMap, loadedPeers] = await Promise.all([
    fetchMarketQuotes([...peerTickers, "SPY"], {
      creds: params.creds,
      fetchImpl: params.fetchImpl,
    }).catch(() => new Map()),
    peerTickers.length === 0
      ? Promise.resolve(new Map<string, SecSnapshot>())
      : params.cachedPeers
        ? Promise.resolve(params.cachedPeers)
        : params.loadCachedPeers
          ? params.loadCachedPeers(peerTickers).catch(() => new Map<string, SecSnapshot>())
          : Promise.resolve(new Map<string, SecSnapshot>()),
  ]);

  const spyRes = quoteMap.get("SPY");
  const spyPrice = spyRes?.ok ? spyRes.quote.effectivePrice : null;
  const peers = peerTickers.map((pt) => {
    const q = quoteMap.get(pt);
    const usdPrice =
      q?.ok && (!q.quote.currency || q.quote.currency.toUpperCase() === "USD")
        ? q.quote.effectivePrice
        : null;
    return buildPeerRow(pt, usdPrice, loadedPeers.get(pt) ?? null);
  });

  return MarketBenchmarkResponseSchema.parse({
    ticker: upper,
    sectorLabel: PEER_CATALOG[upper]?.sector ?? peers[0]?.sector ?? "未映射行业",
    consensus: buildUnavailableConsensus(),
    historicalExtrapolation: buildHistoricalExtrapolation(params.currentPrice, params.secSnapshot),
    valuationBand: null,
    peerMultipleRange: computePeerMultipleRange(params.currentPrice, params.secSnapshot, peers),
    peers,
    spyPrice,
    fetchedAt: new Date().toISOString(),
  });
}
