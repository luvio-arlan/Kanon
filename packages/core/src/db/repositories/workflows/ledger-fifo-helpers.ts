import crypto from "node:crypto";
import { and, asc, eq, gt, lte } from "drizzle-orm";
import { todayIsoUtc } from "../../../contracts/workflow-contracts";
import { roundTo } from "../../../math/valuation-scenarios";
import type { KanonDb } from "../../bootstrap";
import { type LedgerAction, lotsTable } from "../../schema";
import {
  isTickerRestricted,
  normalizeCanonicalTicker,
} from "../enterprise/ic-and-compliance-store";

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

async function consumeFifoLots(
  tx: KanonDb,
  accountId: string,
  userId: string,
  ticker: string,
  sellQty: number,
  tradeDate: string,
): Promise<number> {
  const canonical = normalizeCanonicalTicker(ticker);
  const openLots = await tx
    .select()
    .from(lotsTable)
    .where(
      and(
        eq(lotsTable.accountId, accountId),
        eq(lotsTable.userId, userId),
        eq(lotsTable.ticker, canonical),
        gt(lotsTable.remainingQty, 0),
        lte(lotsTable.openDate, tradeDate),
      ),
    )
    .orderBy(asc(lotsTable.openDate), asc(lotsTable.id));
  const totalAvailable = openLots.reduce((s, l) => s + l.remainingQty, 0);
  if (sellQty > totalAvailable + 1e-6) {
    throw new LedgerPolicyError(
      "SHORT_SELL_BLOCKED",
      `零杠杆风控拦截：截至 ${tradeDate} 可卖持仓 (${totalAvailable}) 不足卖出数量 (${sellQty})，严禁做空或倒填卖出日。`,
    );
  }
  let remaining = sellQty;
  let costSold = 0;
  for (const lot of openLots) {
    if (remaining <= 1e-8) break;
    const take = Math.min(lot.remainingQty, remaining);
    const nextQty = Math.max(0, lot.remainingQty - take);
    costSold += take * lot.costBasisPerShare;
    remaining -= take;
    await tx
      .update(lotsTable)
      .set({ remainingQty: nextQty, closedAt: nextQty <= 1e-8 ? new Date() : null })
      .where(and(eq(lotsTable.id, lot.id), eq(lotsTable.userId, userId)));
  }
  return costSold;
}

async function handleBuyEffect(
  tx: KanonDb,
  accountId: string,
  accountOrgId: string | null,
  cashBalance: number,
  input: RecordTransactionInput,
  ticker: string,
  fees: number,
): Promise<{ nextCash: number; realizedPnl: number | null }> {
  if (!input.noLeverageConfirmed) {
    throw new LedgerPolicyError(
      "NO_LEVERAGE_REQUIRED",
      "零杠杆铁律：买入成交必须确认零融资、零杠杆。",
    );
  }
  if (accountOrgId && (await isTickerRestricted(tx, accountOrgId, ticker))) {
    throw new LedgerPolicyError(
      "RESTRICTED_TICKER",
      `合规限制名单拦截：该组织账户禁止买入 ${ticker}。`,
      403,
    );
  }
  const outlay = input.quantity * input.price + fees;
  if (outlay > cashBalance + 1e-6) {
    throw new LedgerPolicyError(
      "INSUFFICIENT_CASH",
      `零杠杆风控拦截：买入金额 $${outlay.toFixed(2)} 超过账户可用现金 $${cashBalance.toFixed(2)}。`,
    );
  }
  const canonical = normalizeCanonicalTicker(ticker);
  await tx.insert(lotsTable).values({
    id: `lot_${crypto.randomUUID()}`,
    accountId,
    userId: input.userId,
    ticker: canonical,
    openDate: input.tradeDate,
    remainingQty: input.quantity,
    costBasisPerShare: outlay / input.quantity,
  });
  return { nextCash: roundTo(cashBalance - outlay, 2), realizedPnl: null };
}

async function handleSellEffect(
  tx: KanonDb,
  accountId: string,
  cashBalance: number,
  input: RecordTransactionInput,
  ticker: string,
  fees: number,
): Promise<{ nextCash: number; realizedPnl: number }> {
  const costSold = await consumeFifoLots(
    tx,
    accountId,
    input.userId,
    ticker,
    input.quantity,
    input.tradeDate,
  );
  const proceeds = input.quantity * input.price - fees;
  const nextCash = roundTo(cashBalance + proceeds, 2);
  if (nextCash < 0) {
    throw new LedgerPolicyError(
      "INSUFFICIENT_CASH",
      "零杠杆风控拦截：卖出手续费超过成交所得与可用现金，禁止产生负现金余额。",
    );
  }
  return { nextCash, realizedPnl: roundTo(proceeds - costSold, 2) };
}

export async function computeLedgerActionEffect(
  tx: KanonDb,
  accountId: string,
  accountOrgId: string | null,
  cashBalance: number,
  input: RecordTransactionInput,
  ticker: string,
  fees: number,
): Promise<{ nextCash: number; realizedPnl: number | null }> {
  if (input.action === "deposit" || input.action === "dividend") {
    const net = input.quantity * input.price - fees;
    const nextCash = roundTo(cashBalance + net, 2);
    if (net < 0 || nextCash < 0) {
      throw new LedgerPolicyError("INVALID_AMOUNT", "入账金额不能小于手续费或导致负现金余额。");
    }
    return { nextCash, realizedPnl: null };
  }
  if (input.action === "withdraw") {
    const amt = input.quantity * input.price + fees;
    if (amt > cashBalance + 1e-6) {
      throw new LedgerPolicyError(
        "INSUFFICIENT_CASH",
        "零杠杆风控拦截：提现金额超出账户现金余额。",
      );
    }
    return { nextCash: roundTo(cashBalance - amt, 2), realizedPnl: null };
  }
  if (input.action === "buy") {
    return handleBuyEffect(tx, accountId, accountOrgId, cashBalance, input, ticker, fees);
  }
  return handleSellEffect(tx, accountId, cashBalance, input, ticker, fees);
}
