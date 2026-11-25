import {
  analyzeSecForensics,
  analyzeSecQuality,
  type IndustryPeerRow,
  type MarketBenchmarkResponse,
  MarketBenchmarkResponseSchema,
  roundTo,
  type SecSnapshot,
  type StreetConsensus,
  type ValuationBand,
} from "@kanon/core";
import { PEER_CATALOG, PEER_GRAPH } from "./peer-catalog";
import { fetchMarketQuotes } from "./provider-registry";
import type { MarketAdapterCredentials } from "./types";

function selectPeerTickers(ticker: string): string[] {
  const upper = ticker.trim().toUpperCase();
  const explicit = PEER_GRAPH[upper];
  if (explicit) return [...explicit];
  return ["MSFT", "NVDA", "GOOGL", "AMZN"].filter((t) => t !== upper).slice(0, 4);
}

function classifyRevisionTrend(revGrowth: number): StreetConsensus["revisionTrend"] {
  if (revGrowth >= 18) return "up";
  return revGrowth <= 2 ? "down" : "flat";
}

function deriveConsensus(
  currentPrice: number,
  secSnapshot: SecSnapshot | null,
  ticker: string,
): StreetConsensus {
  const annuals = secSnapshot?.annuals ?? [];
  const latest = annuals[annuals.length - 1];
  const quality = analyzeSecQuality(annuals);
  const curated = PEER_CATALOG[ticker.toUpperCase()];
  const rawGrowth = quality?.revenueCagrPct ?? curated?.revenueGrowthPct ?? 12;
  const revGrowth = Math.max(-10, Math.min(45, rawGrowth));
  const fy1RevenueB = latest?.revenue
    ? roundTo((latest.revenue / 1e9) * (1 + revGrowth / 100), 2)
    : null;
  const fy2RevenueB =
    fy1RevenueB !== null ? roundTo(fy1RevenueB * (1 + (revGrowth * 0.85) / 100), 2) : null;
  const epsGrowth = roundTo(revGrowth * 1.05, 1);
  const trailingEps = latest?.dilutedEps && latest.dilutedEps > 0 ? latest.dilutedEps : null;
  const fy1Eps = trailingEps ? roundTo(trailingEps * (1 + epsGrowth / 100), 2) : null;
  const fy2Eps = fy1Eps ? roundTo(fy1Eps * (1 + (epsGrowth * 0.9) / 100), 2) : null;
  const impliedForwardPe = fy1Eps
    ? roundTo(currentPrice / fy1Eps, 1)
    : (curated?.forwardPe ?? null);

  return {
    source: "sec-derived",
    fy1RevenueB,
    fy2RevenueB,
    fy1Eps,
    fy2Eps,
    impliedForwardPe,
    revenueGrowthPct: roundTo(revGrowth, 1),
    epsGrowthPct: epsGrowth,
    revisionTrend: classifyRevisionTrend(revGrowth),
  };
}

function computeValuationBand(
  currentPrice: number,
  secSnapshot: SecSnapshot | null,
  peers: readonly IndustryPeerRow[],
): ValuationBand {
  const latest = secSnapshot?.annuals[secSnapshot.annuals.length - 1];
  const currentPe =
    latest?.dilutedEps && latest.dilutedEps > 0
      ? roundTo(currentPrice / latest.dilutedEps, 1)
      : null;
  const peerPes = peers
    .map((p) => p.forwardPe)
    .filter((v): v is number => typeof v === "number" && v > 0)
    .sort((a, b) => a - b);
  const p50 = peerPes[Math.floor(peerPes.length / 2)] ?? 22;
  const p10 = roundTo(Math.max(8, p50 * 0.65), 1);
  const p90 = roundTo(Math.max(p50 + 8, p50 * 1.45), 1);
  const percentileRank =
    currentPe !== null && p90 > p10
      ? Math.max(0, Math.min(100, Math.round(((currentPe - p10) / (p90 - p10)) * 100)))
      : null;
  return { metricLabel: "P/E", current: currentPe, p10, p50: roundTo(p50, 1), p90, percentileRank };
}

function resolvePeerMultiples(
  livePrice: number | null,
  cachedSnap: SecSnapshot | null | undefined,
  estGrowthPct: number | null,
  fallbackPe: number | null,
) {
  const latest = cachedSnap?.annuals[cachedSnap.annuals.length - 1];
  const marketCapB =
    livePrice && latest?.dilutedShares
      ? roundTo((livePrice * latest.dilutedShares) / 1e9, 1)
      : null;
  const trailingEps = latest?.dilutedEps && latest.dilutedEps > 0 ? latest.dilutedEps : null;
  const clampedGrowth = Math.max(-15, Math.min(45, estGrowthPct ?? 10));
  const fy1Eps = trailingEps ? trailingEps * (1 + clampedGrowth / 100) : null;
  const forwardPe = livePrice && fy1Eps && fy1Eps > 0 ? roundTo(livePrice / fy1Eps, 1) : fallbackPe;
  return { marketCapB, forwardPe };
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
    growth,
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
    params.cachedPeers
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
    sectorLabel: PEER_CATALOG[upper]?.sector ?? peers[0]?.sector ?? "行业基准",
    consensus: deriveConsensus(params.currentPrice, params.secSnapshot, upper),
    valuationBand: computeValuationBand(params.currentPrice, params.secSnapshot, peers),
    peers,
    spyPrice,
    fetchedAt: new Date().toISOString(),
  });
}
