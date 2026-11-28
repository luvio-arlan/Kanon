import type { LedgerAction } from "../../db/schema";
import { roundTo } from "../valuation-scenarios";
import {
  computeTxCashDelta,
  type LedgerReplayFailure,
  type ReplayTxInput,
  resolveTxFxToBase,
  validateFullCashPath,
} from "./ledger-cash";

export type { LedgerReplayFailure, ReplayTxInput } from "./ledger-cash";

export interface SplitActionInput {
  exDate: string;
  ratio: number;
}

export interface ReplayedLot {
  ticker: string;
  openDate: string;
  remainingQty: number;
  costBasisPerShare: number;
}

export interface LedgerReplaySuccess {
  ok: true;
  cashBalance: number;
  openLots: ReplayedLot[];
  realizedPnlByTxId: Map<string, number>;
}

export type LedgerReplayResult = LedgerReplaySuccess | LedgerReplayFailure;

const QTY_EPS = 1e-6;

const SAME_DAY_ACTION_RANK: Record<LedgerAction, number> = {
  deposit: 0,
  dividend: 1,
  sell: 2,
  buy: 3,
  withdraw: 4,
};

/** Filters out reversal rows and their reversed target transactions so replay is bit-identical to never recording them (U1-1). */
export function filterActiveReplayTxs<T extends { id: string; reversesTxId?: string | null }>(
  txs: readonly T[],
): T[] {
  const reversedIds = new Set<string>();
  for (const tx of txs) {
    if (tx.reversesTxId) reversedIds.add(tx.reversesTxId);
  }
  return txs.filter((tx) => !tx.reversesTxId && !reversedIds.has(tx.id));
}

/**
 * Deterministic end-of-day settlement ordering for ledger replay (U0-11 / P2-5):
 * opening balance -> tradeDate -> (deposit/dividend -> sell -> buy -> withdraw) -> createdAt -> id.
 */
export function sortReplayTxs(txs: readonly ReplayTxInput[]): ReplayTxInput[] {
  return [...filterActiveReplayTxs(txs)].sort(
    (a, b) =>
      Number(Boolean(b.isOpeningBalance)) - Number(Boolean(a.isOpeningBalance)) ||
      a.tradeDate.localeCompare(b.tradeDate) ||
      SAME_DAY_ACTION_RANK[a.action] - SAME_DAY_ACTION_RANK[b.action] ||
      a.createdAtMs - b.createdAtMs ||
      a.id.localeCompare(b.id),
  );
}

interface InternalLot {
  openDate: string;
  qty: number;
  costPerShare: number;
  appliedSplits: Set<string>;
}

function applySplitsThroughDate(
  lots: InternalLot[],
  splits: readonly SplitActionInput[],
  upToDate: string,
) {
  for (const sp of splits) {
    if (sp.exDate > upToDate || sp.ratio <= 0 || !Number.isFinite(sp.ratio)) continue;
    for (const lot of lots) {
      if (lot.openDate < sp.exDate && !lot.appliedSplits.has(sp.exDate)) {
        lot.qty *= sp.ratio;
        lot.costPerShare /= sp.ratio;
        lot.appliedSplits.add(sp.exDate);
      }
    }
  }
}

function consumeLotsFifo(
  lots: InternalLot[],
  sellQty: number,
): { ok: true; costSold: number } | { ok: false; available: number } {
  const available = lots.reduce((s, l) => s + l.qty, 0);
  if (sellQty > available + QTY_EPS) return { ok: false, available };
  let rem = sellQty;
  let costSold = 0;
  for (const lot of lots) {
    if (rem <= 1e-8) break;
    if (lot.qty <= 1e-8) continue;
    const take = Math.min(lot.qty, rem);
    costSold += take * lot.costPerShare;
    lot.qty = Math.max(0, lot.qty - take);
    rem -= take;
  }
  return { ok: true, costSold };
}

function collectFinalOpenLots(
  lotsByTicker: ReadonlyMap<string, InternalLot[]>,
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>,
  asOfDate?: string,
): ReplayedLot[] {
  const openLots: ReplayedLot[] = [];
  for (const [ticker, lots] of lotsByTicker) {
    if (asOfDate) applySplitsThroughDate(lots, splitsByTicker.get(ticker) ?? [], asOfDate);
    for (const lot of lots) {
      if (lot.qty > QTY_EPS) {
        openLots.push({
          ticker,
          openDate: lot.openDate,
          remainingQty: roundTo(lot.qty, 6),
          costBasisPerShare: roundTo(lot.costPerShare, 6),
        });
      }
    }
  }
  return openLots;
}

function processSingleReplayTx(
  tx: ReplayTxInput,
  lotsByTicker: Map<string, InternalLot[]>,
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>,
  realizedPnlByTxId: Map<string, number>,
): LedgerReplayFailure | null {
  const ticker = tx.ticker.trim().toUpperCase();
  const lots = lotsByTicker.get(ticker) ?? [];
  lotsByTicker.set(ticker, lots);
  applySplitsThroughDate(lots, splitsByTicker.get(ticker) ?? [], tx.tradeDate);
  const fx = resolveTxFxToBase(tx);
  if (tx.action === "buy") {
    const outlay = (tx.quantity * tx.price + tx.fees) * fx;
    lots.push({
      openDate: tx.tradeDate,
      qty: tx.quantity,
      costPerShare: outlay / tx.quantity,
      appliedSplits: new Set(),
    });
    return null;
  }
  if (tx.action !== "sell") return null;
  const consumed = consumeLotsFifo(lots, tx.quantity);
  if (!consumed.ok) {
    return {
      ok: false,
      code: "SHORT_SELL_BLOCKED",
      failDate: tx.tradeDate,
      ticker,
      message: `严禁做空或倒填卖出：${tx.tradeDate} ${ticker} 可卖股数 (${roundTo(consumed.available, 4)}) 不足 ${tx.quantity}。`,
    };
  }
  realizedPnlByTxId.set(
    tx.id,
    roundTo((tx.quantity * tx.price - tx.fees) * fx - consumed.costSold, 2),
  );
  return null;
}

/** Deterministically replays all account transactions with full cash-path and split-aware FIFO checks (S0). */
export function replayLedgerTransactions(params: {
  transactions: readonly ReplayTxInput[];
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>;
  asOfDate?: string;
}): LedgerReplayResult {
  const sorted = sortReplayTxs(params.transactions);
  const cashErr = validateFullCashPath(sorted);
  if (cashErr) return cashErr;
  let cash = 0;
  const lotsByTicker = new Map<string, InternalLot[]>();
  const realizedPnlByTxId = new Map<string, number>();
  for (const tx of sorted) {
    cash = roundTo(cash + computeTxCashDelta(tx), 4);
    const err = processSingleReplayTx(tx, lotsByTicker, params.splitsByTicker, realizedPnlByTxId);
    if (err) return err;
  }
  const openLots = collectFinalOpenLots(lotsByTicker, params.splitsByTicker, params.asOfDate);
  return { ok: true, cashBalance: roundTo(cash, 2), openLots, realizedPnlByTxId };
}
