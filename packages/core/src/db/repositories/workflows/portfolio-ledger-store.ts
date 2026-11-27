import crypto from "node:crypto";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { todayIsoUtc } from "../../../contracts/workflow-contracts";
import { roundTo } from "../../../math/valuation-scenarios";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import { lotsTable, portfolioAccountsTable, transactionsTable } from "../../schema";
import {
  isTickerRestricted,
  normalizeCanonicalTicker,
} from "../enterprise/ic-and-compliance-store";
import { lockDecisionSnapshotForBuy } from "../portfolio/decision-snapshot-store";
import { replayAndCommitAccountTransaction } from "../portfolio/ledger-replay-store";
import { assertThesisAccess, getThesisIdentity } from "../thesis/thesis-lookups";
import {
  assertValidLedgerNumbers,
  buildNewReplayTx,
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

async function assertBuyAndThesisGuards(
  tx: KanonDb,
  acct: { orgId: string | null },
  input: RecordTransactionInput,
  canonicalTicker: string,
  effectiveNoLeverage: boolean,
) {
  if (input.action === "buy" && !effectiveNoLeverage) {
    throw new LedgerPolicyError(
      "NO_LEVERAGE_REQUIRED",
      "零杠杆铁律：买入成交必须确认零融资、零杠杆。",
    );
  }
  if (
    input.action === "buy" &&
    acct.orgId &&
    (await isTickerRestricted(tx, acct.orgId, canonicalTicker))
  ) {
    throw new LedgerPolicyError(
      "RESTRICTED_TICKER",
      `合规限制名单拦截：该组织账户禁止买入 ${canonicalTicker}。`,
      403,
    );
  }
  if (!input.thesisId) return;
  const canRead = await assertThesisAccess(tx, input.thesisId, input.userId, "read");
  const identity = canRead ? await getThesisIdentity(tx, input.thesisId, input.userId) : null;
  if (!identity)
    throw new LedgerPolicyError("THESIS_NOT_FOUND", "关联研究标的档案不存在或无权访问。", 404);
  if (normalizeCanonicalTicker(identity.ticker) !== canonicalTicker) {
    throw new LedgerPolicyError(
      "THESIS_TICKER_MISMATCH",
      `成交标的 ${canonicalTicker} 与关联档案 ${identity.ticker} 不一致。`,
      400,
    );
  }
}

/** Records a portfolio ledger transaction atomically with S0 deterministic replay and S3 decision snapshot locking. */
export async function recordPortfolioTransaction(db: KanonDb, input: RecordTransactionInput) {
  const fees = input.fees ?? 0;
  assertValidLedgerNumbers(input, fees);
  const ticker = normalizeCanonicalTicker(input.ticker);
  if (
    (input.action === "deposit" || input.action === "dividend") &&
    input.quantity * input.price - fees < 0
  ) {
    throw new LedgerPolicyError("INVALID_AMOUNT", "入账金额不能小于手续费。");
  }
  return runInTransaction(db, async (tx) => {
    const acct = await lockAccountForUpdate(tx, input.accountId, input.userId);
    const effectiveNoLeverage = input.noLeverageConfirmed || acct.acknowledged;
    await assertBuyAndThesisGuards(tx, acct, input, ticker, effectiveNoLeverage);
    const txId = `tx_${crypto.randomUUID()}`;
    const { cashBalance, realizedPnl } = await replayAndCommitAccountTransaction(tx, {
      accountId: acct.id,
      userId: input.userId,
      newTx: buildNewReplayTx(txId, input, ticker, fees, effectiveNoLeverage),
      asOfDate: todayIsoUtc(),
    });
    const snap =
      input.action === "buy" && input.thesisId
        ? await lockDecisionSnapshotForBuy(tx, {
            accountId: acct.id,
            transactionId: txId,
            userId: input.userId,
            thesisId: input.thesisId,
            ticker,
            tradeDate: input.tradeDate,
          })
        : null;
    return {
      transactionId: txId,
      cashBalance,
      realizedPnl,
      snapshotHash: snap?.snapshotHash ?? null,
    };
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
