import type { LedgerAction } from "../../db/schema";
import { roundTo } from "../valuation-scenarios";

export interface ReplayTxInput {
  id: string;
  ticker: string;
  action: LedgerAction;
  quantity: number;
  price: number;
  fees: number;
  tradeDate: string;
  createdAtMs: number;
  isOpeningBalance?: boolean;
}

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

export interface LedgerReplayFailure {
  ok: false;
  code: "INSUFFICIENT_CASH" | "CASH_PATH_NEGATIVE" | "SHORT_SELL_BLOCKED";
  message: string;
  failDate: string;
  ticker?: string;
  minCash?: number;
}

export type LedgerReplayResult = LedgerReplaySuccess | LedgerReplayFailure;

const CASH_EPS = 0.005;
const QTY_EPS = 1e-6;

const SAME_DAY_ACTION_RANK: Record<LedgerAction, number> = {
  deposit: 0,
  dividend: 1,
  sell: 2,
  buy: 3,
  withdraw: 4,
};

/**
 * Deterministic end-of-day settlement ordering for ledger replay (U0-11 / P2-5):
 * opening balance -> tradeDate -> (deposit/dividend -> sell -> buy -> withdraw) -> createdAt -> id.
 */
export function sortReplayTxs(txs: readonly ReplayTxInput[]): ReplayTxInput[] {
  return [...txs].sort(
    (a, b) =>
      Number(Boolean(b.isOpeningBalance)) - Number(Boolean(a.isOpeningBalance)) ||
      a.tradeDate.localeCompare(b.tradeDate) ||
      SAME_DAY_ACTION_RANK[a.action] - SAME_DAY_ACTION_RANK[b.action] ||
      a.createdAtMs - b.createdAtMs ||
      a.id.localeCompare(b.id),
  );
}

/** Computes net cash delta for a single transaction. */
export function computeTxCashDelta(tx: ReplayTxInput): number {
  if (tx.action === "deposit" || tx.action === "dividend") {
    return tx.quantity * tx.price - tx.fees;
  }
  if (tx.action === "withdraw" || tx.action === "buy") {
    return -(tx.quantity * tx.price + tx.fees);
  }
  return tx.quantity * tx.price - tx.fees;
}

/** Validates chronological cash path C_k >= -0.005 across all transactions in O(n) (S0). */
export function validateFullCashPath(sorted: readonly ReplayTxInput[]): LedgerReplayFailure | null {
  let cash = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const tx = sorted[i];
    if (!tx) continue;
    cash = roundTo(cash + computeTxCashDelta(tx), 4);
    if (cash < -CASH_EPS) {
      const isTailOverdraft = i === sorted.length - 1;
      return {
        ok: false,
        code: isTailOverdraft ? "INSUFFICIENT_CASH" : "CASH_PATH_NEGATIVE",
        failDate: tx.tradeDate,
        minCash: roundTo(cash, 2),
        message: isTailOverdraft
          ? `零杠杆现金拦截：可用现金不足，严禁产生负现金余额（将降至 $${cash.toFixed(2)}）。`
          : `零杠杆资金路径拦截：${tx.tradeDate} 将产生负现金余额 $${cash.toFixed(2)}（严禁倒填交易造成历史透支）。`,
      };
    }
  }
  return null;
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
  if (tx.action === "buy") {
    const outlay = tx.quantity * tx.price + tx.fees;
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
  realizedPnlByTxId.set(tx.id, roundTo(tx.quantity * tx.price - tx.fees - consumed.costSold, 2));
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
