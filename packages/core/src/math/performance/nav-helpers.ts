import type { NavBasis } from "../../contracts/analytics";
import type { CloseBarPoint } from "./benchmark-tr";
import { computeTxCashDelta, type ReplayTxInput, type SplitActionInput } from "./ledger-replay";

export interface HoldingState {
  shares: number;
  totalCost: number;
}

export function buildCloseLookup(barsByTicker: ReadonlyMap<string, readonly CloseBarPoint[]>) {
  const map = new Map<string, Map<string, number>>();
  for (const [ticker, bars] of barsByTicker) {
    const m = new Map<string, number>();
    for (const b of bars) if (Number.isFinite(b.close) && b.close > 0) m.set(b.barDate, b.close);
    map.set(ticker, m);
  }
  return map;
}

function applySplitsForHolding(
  ticker: string,
  h: HoldingState,
  splits: readonly SplitActionInput[],
  day: string,
  appliedSplits: Set<string>,
) {
  for (const sp of splits) {
    const key = `${ticker}:${sp.exDate}`;
    if (sp.exDate <= day && !appliedSplits.has(key) && sp.ratio > 0) {
      h.shares *= sp.ratio;
      appliedSplits.add(key);
    }
  }
}

function applySingleDayTx(tx: ReplayTxInput, holdings: Map<string, HoldingState>) {
  const ticker = tx.ticker.trim().toUpperCase();
  if (tx.action === "buy") {
    const cur = holdings.get(ticker) ?? { shares: 0, totalCost: 0 };
    cur.shares += tx.quantity;
    cur.totalCost += tx.quantity * tx.price + tx.fees;
    holdings.set(ticker, cur);
    return;
  }
  if (tx.action !== "sell") return;
  const cur = holdings.get(ticker);
  if (!cur || cur.shares <= 1e-8) return;
  const avg = cur.totalCost / cur.shares;
  cur.shares = Math.max(0, cur.shares - tx.quantity);
  cur.totalCost = Math.max(0, cur.shares * avg);
}

export function applyDayTxsAndSplits(params: {
  day: string;
  dayTxs: readonly ReplayTxInput[];
  holdings: Map<string, HoldingState>;
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>;
  appliedSplits: Set<string>;
}): { cashDelta: number; netFlow: number } {
  let cashDelta = 0;
  let netFlow = 0;
  for (const [ticker, h] of params.holdings) {
    applySplitsForHolding(
      ticker,
      h,
      params.splitsByTicker.get(ticker) ?? [],
      params.day,
      params.appliedSplits,
    );
  }
  for (const tx of params.dayTxs) {
    const delta = computeTxCashDelta(tx);
    cashDelta += delta;
    if (tx.action === "deposit" || tx.action === "withdraw") netFlow += delta;
    applySingleDayTx(tx, params.holdings);
  }
  return { cashDelta, netFlow };
}

function markSingleHolding(
  ticker: string,
  h: HoldingState,
  exact: number | undefined,
  lastClose: Map<string, number>,
): { value: number; kind: "exact" | "stale" | "cost" } {
  if (exact !== undefined) {
    lastClose.set(ticker, exact);
    return { value: h.shares * exact, kind: "exact" };
  }
  const prev = lastClose.get(ticker);
  if (prev !== undefined) return { value: h.shares * prev, kind: "stale" };
  return { value: h.totalCost, kind: "cost" };
}

export function markEquityValue(params: {
  day: string;
  holdings: ReadonlyMap<string, HoldingState>;
  closeLookup: ReadonlyMap<string, ReadonlyMap<string, number>>;
  lastClose: Map<string, number>;
}): { equityValue: number; basis: NavBasis } {
  let equityValue = 0;
  let sawStale = 0;
  let sawCost = 0;
  for (const [ticker, h] of params.holdings) {
    if (h.shares <= 1e-6) continue;
    const marked = markSingleHolding(
      ticker,
      h,
      params.closeLookup.get(ticker)?.get(params.day),
      params.lastClose,
    );
    equityValue += marked.value;
    if (marked.kind === "stale") sawStale += 1;
    if (marked.kind === "cost") sawCost += 1;
  }
  const basis: NavBasis =
    sawCost > 0 ? "cost_fallback" : sawStale > 0 ? "partial_bars" : "full_bars";
  return { equityValue, basis };
}
