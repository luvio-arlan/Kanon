import type { CloseBarPoint } from "./benchmark-tr";
import type { ReplayTxInput, SplitActionInput } from "./ledger-replay";

/**
 * Computes the cumulative split factor `F(d) = ∏_{e_k > d} r_k` mapping a historical date `d`
 * onto the latest split-adjusted close-bar basis used by Yahoo & Polygon (U0-5 / G23).
 */
export function computeSplitBasisFactor(
  tradeDate: string,
  splits: readonly SplitActionInput[],
): number {
  let factor = 1;
  for (const sp of splits) {
    if (sp.exDate > tradeDate && Number.isFinite(sp.ratio) && sp.ratio > 0) {
      factor *= sp.ratio;
    }
  }
  return factor;
}

/**
 * Normalizes buy/sell transactions onto the latest split basis (`q̃ = q * F(d)`, `p̃ = p / F(d)`)
 * while preserving exact cash flows (`q̃ * p̃ = q * p`) so NAV never double-counts splits (U0-5 / G23).
 */
export function normalizeTxToBasis(
  tx: ReplayTxInput,
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>,
): ReplayTxInput {
  if (tx.action !== "buy" && tx.action !== "sell") return tx;
  const ticker = tx.ticker.trim().toUpperCase();
  const splits = splitsByTicker.get(ticker);
  if (!splits?.length) return tx;
  const factor = computeSplitBasisFactor(tx.tradeDate, splits);
  if (Math.abs(factor - 1) <= 1e-12) return tx;
  return {
    ...tx,
    quantity: tx.quantity * factor,
    price: tx.price / factor,
  };
}

/** Normalizes all transactions in a ledger onto the latest split-adjusted bar basis (U0-5). */
export function normalizeTransactionsToSplitBasis(
  transactions: readonly ReplayTxInput[],
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>,
): ReplayTxInput[] {
  return transactions.map((tx) => normalizeTxToBasis(tx, splitsByTicker));
}

function findSplitBoundaryCloses(
  bars: readonly CloseBarPoint[],
  exDate: string,
): { prevClose: number; exClose: number } | null {
  let prevClose: number | null = null;
  for (const b of bars) {
    if (!Number.isFinite(b.close) || b.close <= 0) continue;
    if (b.barDate < exDate) {
      prevClose = b.close;
      continue;
    }
    return prevClose !== null ? { prevClose, exClose: b.close } : null;
  }
  return null;
}

function hasCliffAtSplit(bars: readonly CloseBarPoint[], split: SplitActionInput): boolean {
  if (!Number.isFinite(split.ratio) || split.ratio <= 0 || Math.abs(split.ratio - 1) < 0.05) {
    return false;
  }
  const boundary = findSplitBoundaryCloses(bars, split.exDate);
  if (!boundary) return false;
  const logJump = Math.log(boundary.prevClose / boundary.exClose);
  const logSplit = Math.log(split.ratio);
  return Math.abs(logJump - logSplit) < Math.abs(logJump) * 0.5 && Math.abs(logJump) > 0.25;
}

/**
 * Detects tickers whose stored daily bars exhibit an un-rebased price cliff on a known split exDate
 * so performance can honestly report `rebase_pending` and enqueue `backfill_bars` (U0-5).
 */
export function detectSplitRebaseCliffs(
  barsByTicker: ReadonlyMap<string, readonly CloseBarPoint[]>,
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>,
): string[] {
  const unRebased: string[] = [];
  for (const [ticker, splits] of splitsByTicker) {
    if (!splits.length) continue;
    const bars = [...(barsByTicker.get(ticker) ?? [])].sort((a, b) =>
      a.barDate.localeCompare(b.barDate),
    );
    if (bars.length < 2) continue;
    if (splits.some((sp) => hasCliffAtSplit(bars, sp))) {
      unRebased.push(ticker);
    }
  }
  return unRebased;
}
