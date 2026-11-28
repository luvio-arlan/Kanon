import { type ByokCredentials, buildMarketBenchmarks, fetchMarketQuote } from "@kanon/ai";
import { computeGuidanceCredibility, type ThesisDetail } from "@kanon/core";
import {
  getSecSnapshot,
  getSecSnapshotForUser,
  type KanonDb,
  listCachedSecFilingDocsByTicker,
  listGuidanceCommitments,
  listQuarterlyReviews,
  listResearchNotes,
  listThesisRevisions,
} from "@kanon/core/db";
import { parseMarketHeaders } from "../../_lib/market-headers";

export type WithDbFn = <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>;

export interface AgentStreamParams {
  withDb: WithDbFn;
  thesis: ThesisDetail;
  userId: string;
  request: Request;
  sourceText?: string;
  byok: ByokCredentials | undefined;
}

/** Loads DB evidence + live quote + peer benchmarks for one autonomous IC agent run. */
export async function loadAgentEvidence(params: AgentStreamParams) {
  const marketCreds = parseMarketHeaders(params.request);
  const [dbBundle, quoteRes] = await Promise.all([
    params.withDb(async (tx) => {
      const [secSnapshot, reviews, revisions, cachedFilings, researchNotes, guidanceItems] =
        await Promise.all([
          getSecSnapshotForUser(tx, params.thesis.ticker, params.userId),
          listQuarterlyReviews(tx, params.thesis.id),
          listThesisRevisions(tx, params.thesis.id),
          listCachedSecFilingDocsByTicker(tx, params.thesis.ticker, 3),
          listResearchNotes(tx, params.thesis.id, 12),
          listGuidanceCommitments(tx, params.thesis.id),
        ]);
      return {
        secSnapshot,
        reviews,
        revisions,
        cachedFilings,
        researchNotes,
        guidanceCredibility: computeGuidanceCredibility(guidanceItems),
      };
    }),
    fetchMarketQuote(params.thesis.ticker, { creds: marketCreds }),
  ]);
  const marketQuote = quoteRes.ok ? quoteRes.quote : null;
  const benchmarks = await buildMarketBenchmarks({
    ticker: params.thesis.ticker,
    currentPrice: marketQuote?.effectivePrice ?? params.thesis.currentPrice,
    secSnapshot: dbBundle.secSnapshot,
    loadCachedPeers: async (peerTickers) => {
      const snaps = await params.withDb((tx) =>
        Promise.all(peerTickers.map((pt) => getSecSnapshot(tx, pt))),
      );
      const map = new Map<string, NonNullable<(typeof snaps)[number]>>();
      for (const s of snaps) if (s) map.set(s.ticker.toUpperCase(), s);
      return map;
    },
    creds: marketCreds,
  }).catch(() => null);
  return { ...dbBundle, marketQuote, benchmarks };
}
