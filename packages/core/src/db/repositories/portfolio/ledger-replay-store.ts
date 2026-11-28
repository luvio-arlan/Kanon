import crypto from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  type ReplayTxInput,
  replayLedgerTransactions,
  type SplitActionInput,
} from "../../../math/performance";
import type { KanonDb } from "../../bootstrap";
import {
  corporateActionsTable,
  lotsTable,
  portfolioAccountsTable,
  securitiesTable,
  transactionsTable,
} from "../../schema";
import { normalizeCanonicalTicker } from "../enterprise/ic-and-compliance-store";
import { LedgerPolicyError } from "../workflows/ledger-fifo-helpers";

/** Loads split corporate actions grouped by canonical ticker for ledger replay (S0). */
export async function loadSplitsByTickers(
  tx: KanonDb,
  tickers: readonly string[],
): Promise<Map<string, SplitActionInput[]>> {
  const unique = [
    ...new Set(tickers.map((t) => normalizeCanonicalTicker(t)).filter((t) => t && t !== "CASH")),
  ];
  const map = new Map<string, SplitActionInput[]>();
  if (unique.length === 0) return map;
  const secs = await tx
    .select({ id: securitiesTable.id, ticker: securitiesTable.ticker })
    .from(securitiesTable)
    .where(inArray(securitiesTable.ticker, unique));
  if (secs.length === 0) return map;
  const tickerBySecId = new Map(secs.map((s) => [s.id, normalizeCanonicalTicker(s.ticker)]));
  const actions = await tx
    .select()
    .from(corporateActionsTable)
    .where(
      and(
        inArray(
          corporateActionsTable.securityId,
          secs.map((s) => s.id),
        ),
        eq(corporateActionsTable.kind, "split"),
      ),
    )
    .orderBy(asc(corporateActionsTable.exDate));
  for (const act of actions) {
    const ticker = tickerBySecId.get(act.securityId);
    if (!ticker || !act.ratio || act.ratio <= 0) continue;
    const arr = map.get(ticker) ?? [];
    arr.push({ exDate: act.exDate, ratio: act.ratio });
    map.set(ticker, arr);
  }
  return map;
}

async function syncRecalculatedSellPnl(
  tx: KanonDb,
  existing: ReadonlyArray<{ id: string; action: string; realizedPnl: number | null }>,
  realizedPnlByTxId: ReadonlyMap<string, number>,
  userId: string,
) {
  for (const row of existing) {
    if (row.action !== "sell") continue;
    const recalculated = realizedPnlByTxId.get(row.id);
    if (recalculated !== undefined && recalculated !== row.realizedPnl) {
      await tx
        .update(transactionsTable)
        .set({ realizedPnl: recalculated })
        .where(and(eq(transactionsTable.id, row.id), eq(transactionsTable.userId, userId)));
    }
  }
}

async function rebuildAccountLotsAndCash(
  tx: KanonDb,
  accountId: string,
  userId: string,
  openLots: ReadonlyArray<{
    ticker: string;
    openDate: string;
    remainingQty: number;
    costBasisPerShare: number;
  }>,
  cashBalance: number,
) {
  await tx
    .delete(lotsTable)
    .where(and(eq(lotsTable.accountId, accountId), eq(lotsTable.userId, userId)));
  if (openLots.length > 0) {
    await tx.insert(lotsTable).values(
      openLots.map((lot) => ({
        id: `lot_${crypto.randomUUID()}`,
        accountId,
        userId,
        ticker: lot.ticker,
        openDate: lot.openDate,
        remainingQty: lot.remainingQty,
        costBasisPerShare: lot.costBasisPerShare,
      })),
    );
  }
  await tx
    .update(portfolioAccountsTable)
    .set({ cashBalance })
    .where(
      and(eq(portfolioAccountsTable.id, accountId), eq(portfolioAccountsTable.userId, userId)),
    );
}

type NewReplayTx = ReplayTxInput & {
  thesisId: string | null;
  externalRef: string | null;
  noLeverageConfirmed: boolean;
  note: string;
  tradeCurrency: string;
  fxToBase: number;
  fxSource: string;
  reversesTxId: string | null;
};

async function insertReplayedTransaction(
  tx: KanonDb,
  accountId: string,
  userId: string,
  newTx: NewReplayTx,
  realizedPnl: number | null,
) {
  await tx.insert(transactionsTable).values({
    id: newTx.id,
    accountId,
    userId,
    thesisId: newTx.thesisId,
    ticker: newTx.ticker,
    action: newTx.action,
    quantity: newTx.quantity,
    price: newTx.price,
    fees: newTx.fees,
    realizedPnl,
    externalRef: newTx.externalRef,
    tradeDate: newTx.tradeDate,
    tradeCurrency: newTx.tradeCurrency,
    fxToBase: newTx.fxToBase,
    fxSource: newTx.fxSource,
    reversesTxId: newTx.reversesTxId,
    noLeverageConfirmed: newTx.noLeverageConfirmed,
    note: newTx.note,
  });
}

function toReplayInput(r: typeof transactionsTable.$inferSelect): ReplayTxInput {
  return {
    id: r.id,
    ticker: normalizeCanonicalTicker(r.ticker),
    action: r.action,
    quantity: r.quantity,
    price: r.price,
    fees: r.fees,
    tradeCurrency: r.tradeCurrency,
    fxToBase: r.fxToBase,
    reversesTxId: r.reversesTxId,
    tradeDate: r.tradeDate,
    createdAtMs: r.createdAt.getTime(),
    isOpeningBalance: r.externalRef === "opening_balance",
  };
}

/**
 * Atomically validates full cash path + split-normalized FIFO across all account transactions,
 * inserts the new transaction, rebuilds open lots, updates realized_pnl, and updates cash balance (S0).
 */
export async function replayAndCommitAccountTransaction(
  tx: KanonDb,
  params: { accountId: string; userId: string; newTx: NewReplayTx; asOfDate: string },
): Promise<{ cashBalance: number; realizedPnl: number | null }> {
  const existing = await tx
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.accountId, params.accountId),
        eq(transactionsTable.userId, params.userId),
      ),
    )
    .orderBy(asc(transactionsTable.tradeDate), asc(transactionsTable.createdAt));
  const replayInputs: ReplayTxInput[] = [...existing.map(toReplayInput), params.newTx];
  const splitsByTicker = await loadSplitsByTickers(
    tx,
    replayInputs.map((t) => t.ticker),
  );
  const replayed = replayLedgerTransactions({
    transactions: replayInputs,
    splitsByTicker,
    asOfDate: params.asOfDate,
  });
  if (!replayed.ok) throw new LedgerPolicyError(replayed.code, replayed.message, 400);
  const newRealizedPnl = replayed.realizedPnlByTxId.get(params.newTx.id) ?? null;
  await insertReplayedTransaction(
    tx,
    params.accountId,
    params.userId,
    params.newTx,
    newRealizedPnl,
  );
  await syncRecalculatedSellPnl(tx, existing, replayed.realizedPnlByTxId, params.userId);
  await rebuildAccountLotsAndCash(
    tx,
    params.accountId,
    params.userId,
    replayed.openLots,
    replayed.cashBalance,
  );
  return { cashBalance: replayed.cashBalance, realizedPnl: newRealizedPnl };
}
