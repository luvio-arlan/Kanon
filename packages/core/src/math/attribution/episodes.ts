import { filterActiveReplayTxs, type SplitActionInput } from "../performance/ledger-replay";
import { roundTo } from "../valuation-scenarios";

export interface EpisodeTxInput {
  id: string;
  thesisId: string | null;
  ticker: string;
  action: "buy" | "sell" | "dividend" | "deposit" | "withdraw";
  quantity: number;
  price: number;
  fees: number;
  tradeDate: string;
  createdAtMs: number;
  reversesTxId?: string | null;
}

export interface SnapshotRefInput {
  transactionId: string;
  thesisId: string;
  snapshotHash: string;
  hypothesisIds: string[];
}

export interface RawDecisionEpisode {
  id: string;
  thesisId: string | null;
  ticker: string;
  openDate: string;
  closeDate: string | null;
  status: "open" | "closed";
  entryPrice: number;
  exitOrMarkPrice: number;
  totalReturnPct: number;
  snapshotHash: string | null;
  snapshotHypothesisIds: string[];
}

interface ActiveEp {
  id: string;
  thesisId: string | null;
  ticker: string;
  openDate: string;
  shares: number;
  totalInvested: number;
  totalReturned: number;
  lastPrice: number;
  snapshotHash: string | null;
  snapshotHypothesisIds: string[];
  appliedSplits: Set<string>;
}

function applyEpSplits(ep: ActiveEp, splits: readonly SplitActionInput[], upToDate: string) {
  for (const sp of splits) {
    if (
      sp.exDate > ep.openDate &&
      sp.exDate <= upToDate &&
      !ep.appliedSplits.has(sp.exDate) &&
      sp.ratio > 0
    ) {
      ep.shares *= sp.ratio;
      ep.appliedSplits.add(sp.exDate);
    }
  }
}

function finalizeEpisode(
  ep: ActiveEp,
  closeDate: string | null,
  markPrice: number,
): RawDecisionEpisode {
  const isClosed = closeDate !== null;
  const endValue = isClosed ? ep.totalReturned : ep.totalReturned + ep.shares * markPrice;
  const totalReturnPct =
    ep.totalInvested > 1e-6
      ? roundTo(((endValue - ep.totalInvested) / ep.totalInvested) * 100, 2)
      : 0;
  const entryPrice =
    ep.shares > 1e-6 && !isClosed
      ? roundTo(ep.totalInvested / ep.shares, 2)
      : roundTo(ep.lastPrice, 2);
  return {
    id: ep.id,
    thesisId: ep.thesisId,
    ticker: ep.ticker,
    openDate: ep.openDate,
    closeDate,
    status: isClosed ? "closed" : "open",
    entryPrice,
    exitOrMarkPrice: roundTo(markPrice, 2),
    totalReturnPct,
    snapshotHash: ep.snapshotHash,
    snapshotHypothesisIds: ep.snapshotHypothesisIds,
  };
}

function createEpisodeFromBuy(
  tx: EpisodeTxInput,
  ticker: string,
  snap: SnapshotRefInput | undefined,
): ActiveEp {
  return {
    id: `ep_${tx.id}`,
    thesisId: snap?.thesisId ?? tx.thesisId,
    ticker,
    openDate: tx.tradeDate,
    shares: 0,
    totalInvested: 0,
    totalReturned: 0,
    lastPrice: tx.price,
    snapshotHash: snap?.snapshotHash ?? null,
    snapshotHypothesisIds: snap?.hypothesisIds ?? [],
    appliedSplits: new Set(),
  };
}

function applyEpisodeTx(
  tx: EpisodeTxInput,
  activeByTicker: Map<string, ActiveEp>,
  finished: RawDecisionEpisode[],
  snapshotsByTxId: ReadonlyMap<string, SnapshotRefInput>,
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>,
) {
  const ticker = tx.ticker.trim().toUpperCase();
  let ep = activeByTicker.get(ticker);
  if (ep) applyEpSplits(ep, splitsByTicker.get(ticker) ?? [], tx.tradeDate);
  if (tx.action === "buy") {
    if (!ep) {
      ep = createEpisodeFromBuy(tx, ticker, snapshotsByTxId.get(tx.id));
      activeByTicker.set(ticker, ep);
    }
    ep.shares += tx.quantity;
    ep.totalInvested += tx.quantity * tx.price + tx.fees;
    ep.lastPrice = tx.price;
    return;
  }
  if (!ep) return;
  if (tx.action === "dividend") {
    ep.totalReturned += tx.quantity * tx.price - tx.fees;
    return;
  }
  if (tx.action !== "sell") return;
  ep.shares = Math.max(0, ep.shares - tx.quantity);
  ep.totalReturned += tx.quantity * tx.price - tx.fees;
  if (ep.shares <= 1e-6) {
    finished.push(finalizeEpisode(ep, tx.tradeDate, tx.price));
    activeByTicker.delete(ticker);
  }
}

/** Groups chronological buy/sell/dividend transactions into open/closed investment episodes (S3). */
export function buildDecisionEpisodes(params: {
  transactions: readonly EpisodeTxInput[];
  snapshotsByTxId: ReadonlyMap<string, SnapshotRefInput>;
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>;
  latestCloseByTicker: ReadonlyMap<string, number>;
  asOfDate: string;
}): RawDecisionEpisode[] {
  const sorted = filterActiveReplayTxs(params.transactions)
    .filter((t) => t.action === "buy" || t.action === "sell" || t.action === "dividend")
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.createdAtMs - b.createdAtMs);
  const activeByTicker = new Map<string, ActiveEp>();
  const finished: RawDecisionEpisode[] = [];
  for (const tx of sorted) {
    applyEpisodeTx(tx, activeByTicker, finished, params.snapshotsByTxId, params.splitsByTicker);
  }
  for (const ep of activeByTicker.values()) {
    applyEpSplits(ep, params.splitsByTicker.get(ep.ticker) ?? [], params.asOfDate);
    const mark = params.latestCloseByTicker.get(ep.ticker) ?? ep.lastPrice;
    finished.push(finalizeEpisode(ep, null, mark));
  }
  return finished.sort((a, b) => b.openDate.localeCompare(a.openDate));
}
