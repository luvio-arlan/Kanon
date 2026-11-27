import { todayIsoUtc } from "../../../contracts/workflow-contracts";
import type { LedgerAction } from "../../schema";

export class LedgerPolicyError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "LedgerPolicyError";
    this.code = code;
    this.status = status;
  }
}

export interface RecordTransactionInput {
  accountId: string;
  userId: string;
  thesisId?: string | null;
  ticker: string;
  action: LedgerAction;
  quantity: number;
  price: number;
  fees?: number;
  tradeDate: string;
  noLeverageConfirmed: boolean;
  note?: string;
  externalRef?: string;
}

export function assertValidLedgerNumbers(input: RecordTransactionInput, fees: number) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new LedgerPolicyError("INVALID_QUANTITY", "成交数量必须为大于 0 的有限数值。");
  }
  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new LedgerPolicyError("INVALID_PRICE", "成交价格必须为非负有限数值。");
  }
  if (!Number.isFinite(fees) || fees < 0) {
    throw new LedgerPolicyError("INVALID_FEES", "手续费必须为非负有限数值。");
  }
  if ((input.action === "buy" || input.action === "sell") && input.price <= 0) {
    throw new LedgerPolicyError("INVALID_PRICE", "买卖成交价格必须大于 0。");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.tradeDate) || input.tradeDate > todayIsoUtc()) {
    throw new LedgerPolicyError("INVALID_TRADE_DATE", "成交日期必须为合法日期且不得晚于今天。");
  }
}

export function buildNewReplayTx(
  txId: string,
  input: RecordTransactionInput,
  ticker: string,
  fees: number,
  effectiveNoLeverage: boolean,
) {
  return {
    id: txId,
    thesisId: input.thesisId ?? null,
    ticker,
    action: input.action,
    quantity: input.quantity,
    price: input.price,
    fees,
    tradeDate: input.tradeDate,
    createdAtMs: Date.now(),
    externalRef: input.externalRef?.trim() || null,
    noLeverageConfirmed: effectiveNoLeverage,
    note: input.note?.trim() ?? "",
  };
}
