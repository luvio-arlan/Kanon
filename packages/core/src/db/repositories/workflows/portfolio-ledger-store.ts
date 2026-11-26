import crypto from "node:crypto";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { roundTo } from "../../../math/valuation-scenarios";
import type { KanonDb } from "../../bootstrap";
import {
  type LedgerAction,
  lotsTable,
  portfolioAccountsTable,
  transactionsTable,
} from "../../schema";

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
}

export interface PortfolioPositionSummary {
  ticker: string;
  shares: number;
  avgCostBasis: number;
  totalCost: number;
}

export async function createPortfolioAccount(
  db: KanonDb,
  input: { userId: string; name: string; baseCurrency?: string; initialCash?: number },
) {
  const cashBalance = Math.max(0, input.initialCash ?? 0);
  const id = `acct_${crypto.randomUUID()}`;
  await db.insert(portfolioAccountsTable).values({
    id,
    userId: input.userId,
    name: input.name.trim() || "主投研账户",
    baseCurrency: (input.baseCurrency ?? "USD").toUpperCase(),
    cashBalance,
  });
  return { id, cashBalance };
}

export async function listPortfolioAccounts(db: KanonDb, userId: string) {
  return db
    .select()
    .from(portfolioAccountsTable)
    .where(eq(portfolioAccountsTable.userId, userId))
    .orderBy(asc(portfolioAccountsTable.createdAt));
}

async function consumeFifoLots(
  db: KanonDb,
  accountId: string,
  ticker: string,
  sellQty: number,
): Promise<number> {
  const openLots = await db
    .select()
    .from(lotsTable)
    .where(
      and(
        eq(lotsTable.accountId, accountId),
        eq(lotsTable.ticker, ticker),
        gt(lotsTable.remainingQty, 0),
      ),
    )
    .orderBy(asc(lotsTable.openDate), asc(lotsTable.id));
  const totalAvailable = openLots.reduce((s, l) => s + l.remainingQty, 0);
  if (sellQty > totalAvailable + 1e-6) {
    throw new Error(
      `零杠杆风控拦截：卖出数量 (${sellQty}) 超出持仓 (${totalAvailable})，严禁做空。`,
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
    await db
      .update(lotsTable)
      .set({ remainingQty: nextQty, closedAt: nextQty <= 1e-8 ? new Date() : null })
      .where(eq(lotsTable.id, lot.id));
  }
  return costSold;
}

async function computeActionEffect(
  db: KanonDb,
  accountId: string,
  cashBalance: number,
  input: RecordTransactionInput,
  ticker: string,
  fees: number,
): Promise<{ nextCash: number; realizedPnl: number | null }> {
  if (input.action === "deposit" || input.action === "dividend") {
    return {
      nextCash: roundTo(cashBalance + Math.max(0, input.quantity * input.price - fees), 2),
      realizedPnl: null,
    };
  }
  if (input.action === "withdraw") {
    const amt = Math.max(0, input.quantity * input.price + fees);
    if (amt > cashBalance + 1e-6) throw new Error("零杠杆风控拦截：提现金额超出账户现金余额。");
    return { nextCash: roundTo(cashBalance - amt, 2), realizedPnl: null };
  }
  if (input.action === "buy") {
    if (!input.noLeverageConfirmed) throw new Error("零杠杆铁律：买入成交必须确认零融资、零杠杆。");
    const outlay = input.quantity * input.price + fees;
    if (outlay > cashBalance + 1e-6) {
      throw new Error(
        `零杠杆风控拦截：买入金额 $${outlay.toFixed(2)} 超过账户可用现金 $${cashBalance.toFixed(2)}。`,
      );
    }
    await db.insert(lotsTable).values({
      id: `lot_${crypto.randomUUID()}`,
      accountId,
      userId: input.userId,
      ticker,
      openDate: input.tradeDate,
      remainingQty: input.quantity,
      costBasisPerShare: outlay / Math.max(1e-9, input.quantity),
    });
    return { nextCash: roundTo(cashBalance - outlay, 2), realizedPnl: null };
  }
  const costSold = await consumeFifoLots(db, accountId, ticker, input.quantity);
  const proceeds = input.quantity * input.price - fees;
  return {
    nextCash: roundTo(cashBalance + proceeds, 2),
    realizedPnl: roundTo(proceeds - costSold, 2),
  };
}

/** Records a portfolio ledger transaction with FIFO lot accounting and hard zero-leverage guards. */
export async function recordPortfolioTransaction(db: KanonDb, input: RecordTransactionInput) {
  const [acct] = await db
    .select()
    .from(portfolioAccountsTable)
    .where(
      and(
        eq(portfolioAccountsTable.id, input.accountId),
        eq(portfolioAccountsTable.userId, input.userId),
      ),
    )
    .limit(1);
  if (!acct) throw new Error("投资组合账户不存在。");

  const ticker = input.ticker.trim().toUpperCase();
  const fees = Math.max(0, input.fees ?? 0);
  const { nextCash, realizedPnl } = await computeActionEffect(
    db,
    acct.id,
    acct.cashBalance,
    input,
    ticker,
    fees,
  );
  const txId = `tx_${crypto.randomUUID()}`;
  await db.insert(transactionsTable).values({
    id: txId,
    accountId: acct.id,
    userId: input.userId,
    thesisId: input.thesisId ?? null,
    ticker,
    action: input.action,
    quantity: input.quantity,
    price: input.price,
    fees,
    tradeDate: input.tradeDate,
    noLeverageConfirmed: input.noLeverageConfirmed,
    note: input.note?.trim() ?? "",
  });
  await db
    .update(portfolioAccountsTable)
    .set({ cashBalance: nextCash })
    .where(eq(portfolioAccountsTable.id, acct.id));
  return { transactionId: txId, cashBalance: nextCash, realizedPnl };
}

export async function listPortfolioPositions(
  db: KanonDb,
  accountId: string,
): Promise<PortfolioPositionSummary[]> {
  const openLots = await db
    .select()
    .from(lotsTable)
    .where(and(eq(lotsTable.accountId, accountId), gt(lotsTable.remainingQty, 0)));
  const grouped = new Map<string, { shares: number; totalCost: number }>();
  for (const lot of openLots) {
    const prev = grouped.get(lot.ticker) ?? { shares: 0, totalCost: 0 };
    prev.shares += lot.remainingQty;
    prev.totalCost += lot.remainingQty * lot.costBasisPerShare;
    grouped.set(lot.ticker, prev);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ticker, g]) => ({
      ticker,
      shares: roundTo(g.shares, 4),
      avgCostBasis: g.shares > 0 ? roundTo(g.totalCost / g.shares, 4) : 0,
      totalCost: roundTo(g.totalCost, 2),
    }));
}

export async function listPortfolioTransactions(db: KanonDb, accountId: string, limit = 50) {
  return db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.accountId, accountId))
    .orderBy(desc(transactionsTable.tradeDate), desc(transactionsTable.createdAt))
    .limit(limit);
}
