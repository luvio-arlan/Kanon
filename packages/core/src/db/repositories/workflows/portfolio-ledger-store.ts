import crypto from "node:crypto";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { todayIsoUtc } from "../../../contracts/workflow-contracts";
import { roundTo } from "../../../math/valuation-scenarios";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import { lotsTable, portfolioAccountsTable, transactionsTable } from "../../schema";
import {
  assertValidLedgerNumbers,
  computeLedgerActionEffect,
  LedgerPolicyError,
  type RecordTransactionInput,
} from "./ledger-fifo-helpers";

export { LedgerPolicyError, type RecordTransactionInput } from "./ledger-fifo-helpers";

export interface PortfolioPositionSummary {
  ticker: string;
  shares: number;
  avgCostBasis: number;
  totalCost: number;
}

export async function createPortfolioAccount(
  db: KanonDb,
  input: {
    userId: string;
    orgId?: string | null;
    name: string;
    baseCurrency?: string;
    initialCash?: number;
    noLeverageConfirmed?: boolean;
  },
) {
  const initialCash = input.initialCash ?? 0;
  if (!Number.isFinite(initialCash) || initialCash < 0) {
    throw new LedgerPolicyError("INVALID_INITIAL_CASH", "初始现金必须为非负有限数值。");
  }
  const cashBalance = roundTo(initialCash, 2);
  const id = `acct_${crypto.randomUUID()}`;
  const now = new Date();
  await runInTransaction(db, async (tx) => {
    await tx.insert(portfolioAccountsTable).values({
      id,
      userId: input.userId,
      orgId: input.orgId ?? null,
      name: input.name.trim() || "主投研账户",
      baseCurrency: (input.baseCurrency ?? "USD").toUpperCase(),
      cashBalance,
      noLeverageAcknowledgedAt: input.noLeverageConfirmed === false ? null : now,
    });
    if (cashBalance > 0.005) {
      await tx.insert(transactionsTable).values({
        id: `tx_open_${id}`,
        accountId: id,
        userId: input.userId,
        thesisId: null,
        ticker: "CASH",
        action: "deposit",
        quantity: cashBalance,
        price: 1,
        fees: 0,
        realizedPnl: null,
        externalRef: "opening_balance",
        tradeDate: todayIsoUtc(),
        noLeverageConfirmed: true,
        note: "账户期初现金",
      });
    }
  });
  return { id, cashBalance, orgId: input.orgId ?? null };
}

export async function listPortfolioAccounts(db: KanonDb, userId: string) {
  return db
    .select()
    .from(portfolioAccountsTable)
    .where(eq(portfolioAccountsTable.userId, userId))
    .orderBy(asc(portfolioAccountsTable.createdAt));
}

async function lockAccountForUpdate(tx: KanonDb, accountId: string, userId: string) {
  const locked = await tx.execute(sql`
    SELECT id, org_id, cash_balance, no_leverage_acknowledged_at
    FROM portfolio_accounts
    WHERE id = ${accountId} AND user_id = ${userId}
    FOR UPDATE
  `);
  const rows = (Array.isArray(locked) ? locked : locked.rows) as Array<{
    id?: string;
    org_id?: string | null;
    cash_balance?: number;
    no_leverage_acknowledged_at?: unknown;
  }>;
  const acct = rows[0];
  if (!acct?.id) throw new LedgerPolicyError("ACCOUNT_NOT_FOUND", "投资组合账户不存在。", 404);
  const cashBalance = Number(acct.cash_balance);
  if (!Number.isFinite(cashBalance)) {
    throw new LedgerPolicyError("CORRUPTED_BALANCE", "账户现金余额异常，已阻断交易。");
  }
  return {
    id: acct.id,
    orgId: acct.org_id ?? null,
    cashBalance,
    acknowledged: Boolean(acct.no_leverage_acknowledged_at),
  };
}

/** Records a portfolio ledger transaction atomically under row-level FOR UPDATE locking. */
export async function recordPortfolioTransaction(db: KanonDb, input: RecordTransactionInput) {
  const fees = input.fees ?? 0;
  assertValidLedgerNumbers(input, fees);
  const ticker = input.ticker.trim().toUpperCase();

  return runInTransaction(db, async (tx) => {
    const acct = await lockAccountForUpdate(tx, input.accountId, input.userId);
    const effectiveNoLeverage = input.noLeverageConfirmed || acct.acknowledged;
    const { nextCash, realizedPnl } = await computeLedgerActionEffect(
      tx,
      acct.id,
      acct.orgId,
      acct.cashBalance,
      { ...input, noLeverageConfirmed: effectiveNoLeverage },
      ticker,
      fees,
    );
    const txId = `tx_${crypto.randomUUID()}`;
    await tx.insert(transactionsTable).values({
      id: txId,
      accountId: acct.id,
      userId: input.userId,
      thesisId: input.thesisId ?? null,
      ticker,
      action: input.action,
      quantity: input.quantity,
      price: input.price,
      fees,
      realizedPnl,
      externalRef: input.externalRef?.trim() || null,
      tradeDate: input.tradeDate,
      noLeverageConfirmed: effectiveNoLeverage,
      note: input.note?.trim() ?? "",
    });
    await tx
      .update(portfolioAccountsTable)
      .set({ cashBalance: nextCash })
      .where(
        and(
          eq(portfolioAccountsTable.id, acct.id),
          eq(portfolioAccountsTable.userId, input.userId),
        ),
      );
    return { transactionId: txId, cashBalance: nextCash, realizedPnl };
  });
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
