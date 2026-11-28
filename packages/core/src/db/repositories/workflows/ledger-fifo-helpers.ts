import { sql } from "drizzle-orm";
import {
  type CurrencyCode,
  CurrencyCodeSchema,
  type FxSource,
} from "../../../contracts/intel/primitives";
import { maxTradeDateIsoUtc14 } from "../../../contracts/workflow-contracts";
import type { KanonDb } from "../../bootstrap";
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
  tradeCurrency?: CurrencyCode;
  fxToBase?: number;
  fxDeviationAck?: boolean;
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.tradeDate) || input.tradeDate > maxTradeDateIsoUtc14()) {
    throw new LedgerPolicyError("INVALID_TRADE_DATE", "成交日期必须为合法日期且不得晚于今天。");
  }
}

export function buildNewReplayTx(
  txId: string,
  input: RecordTransactionInput,
  ticker: string,
  fees: number,
  effectiveNoLeverage: boolean,
  resolvedFx: { tradeCurrency: CurrencyCode; fxToBase: number; fxSource: FxSource },
) {
  return {
    id: txId,
    thesisId: input.thesisId ?? null,
    ticker,
    action: input.action,
    quantity: input.quantity,
    price: input.price,
    fees,
    tradeCurrency: resolvedFx.tradeCurrency,
    fxToBase: resolvedFx.fxToBase,
    fxSource: resolvedFx.fxSource,
    reversesTxId: null as string | null,
    tradeDate: input.tradeDate,
    createdAtMs: Date.now(),
    externalRef: input.externalRef?.trim() || null,
    noLeverageConfirmed: effectiveNoLeverage,
    note: input.note?.trim() ?? "",
  };
}

/** Row-locks a tenant account and reports its currency confirmation state (no USD fallback — V0-4). */
export async function lockAccountRowForUpdate(tx: KanonDb, accountId: string, userId: string) {
  const locked = await tx.execute(sql`
    SELECT id, org_id, base_currency, cash_balance, no_leverage_acknowledged_at, ledger_inconsistent
    FROM portfolio_accounts
    WHERE id = ${accountId} AND user_id = ${userId}
    FOR UPDATE
  `);
  const rows = (Array.isArray(locked) ? locked : locked.rows) as Array<{
    id?: string;
    org_id?: string | null;
    base_currency?: string;
    cash_balance?: number;
    no_leverage_acknowledged_at?: unknown;
    ledger_inconsistent?: boolean;
  }>;
  const acct = rows[0];
  if (!acct?.id) throw new LedgerPolicyError("ACCOUNT_NOT_FOUND", "投资组合账户不存在。", 404);
  const cashBalance = Number(acct.cash_balance);
  if (!Number.isFinite(cashBalance)) {
    throw new LedgerPolicyError("CORRUPTED_BALANCE", "账户现金余额异常，已阻断交易。");
  }
  const parsedCur = CurrencyCodeSchema.safeParse((acct.base_currency ?? "").trim().toUpperCase());
  return {
    id: acct.id,
    orgId: acct.org_id ?? null,
    baseCurrency: parsedCur.success ? parsedCur.data : null,
    unconfirmed: Boolean(acct.ledger_inconsistent) || !parsedCur.success,
    cashBalance,
    acknowledged: Boolean(acct.no_leverage_acknowledged_at),
  };
}

/**
 * Row-locks a currency-confirmed tenant account. Accounts flagged `ledger_inconsistent` or carrying an
 * unsupported base currency are rejected with 409 `CURRENCY_UNCONFIRMED` (V0-4).
 */
export async function lockAccountForUpdate(tx: KanonDb, accountId: string, userId: string) {
  const acct = await lockAccountRowForUpdate(tx, accountId, userId);
  const baseCurrency = acct.baseCurrency;
  if (acct.unconfirmed || !baseCurrency) {
    throw new LedgerPolicyError("CURRENCY_UNCONFIRMED", "账户币种待确认，请先完成币种确认。", 409);
  }
  return { ...acct, baseCurrency };
}
