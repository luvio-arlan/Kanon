import type { LedgerAction } from "../../db/schema";
import { roundTo } from "../valuation-scenarios";

const CASH_EPS = 0.005;

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
  tradeCurrency?: string | null;
  fxToBase?: number | null;
  reversesTxId?: string | null;
}

export interface LedgerReplayFailure {
  ok: false;
  code: "INSUFFICIENT_CASH" | "CASH_PATH_NEGATIVE" | "SHORT_SELL_BLOCKED";
  message: string;
  failDate: string;
  ticker?: string;
  minCash?: number;
}

/**
 * Trade-currency → account-base multiplier. Absent `fxToBase` means the trade is already in base currency:
 * persisted rows always carry an explicit rate (`chk_tx_fx`), and legacy NULL-rate accounts are gated upstream
 * as `currency_unconfirmed` (V0-4). A present-but-invalid rate throws instead of silently becoming 1.
 */
export function resolveTxFxToBase(tx: Pick<ReplayTxInput, "id" | "fxToBase">): number {
  if (tx.fxToBase === null || tx.fxToBase === undefined) return 1;
  if (!Number.isFinite(tx.fxToBase) || tx.fxToBase <= 0) {
    throw new Error(`Invalid fxToBase on transaction ${tx.id}`);
  }
  return tx.fxToBase;
}

/** Computes net cash delta in account base currency for a single transaction (U1-1). */
export function computeTxCashDelta(tx: ReplayTxInput): number {
  const fx = resolveTxFxToBase(tx);
  if (tx.action === "deposit" || tx.action === "dividend") {
    return (tx.quantity * tx.price - tx.fees) * fx;
  }
  if (tx.action === "withdraw" || tx.action === "buy") {
    return -(tx.quantity * tx.price + tx.fees) * fx;
  }
  return (tx.quantity * tx.price - tx.fees) * fx;
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
