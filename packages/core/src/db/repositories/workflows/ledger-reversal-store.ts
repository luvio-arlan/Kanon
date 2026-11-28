import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { todayIsoUtc } from "../../../contracts/workflow-contracts";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import { transactionsTable } from "../../schema";
import { normalizeCanonicalTicker } from "../enterprise/ic-and-compliance-store";
import { replayAndCommitAccountTransaction } from "../portfolio/ledger-replay-store";
import { LedgerPolicyError, lockAccountForUpdate } from "./ledger-fifo-helpers";

async function loadReversibleTx(
  tx: KanonDb,
  accountId: string,
  userId: string,
  transactionId: string,
) {
  const [orig] = await tx
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.id, transactionId),
        eq(transactionsTable.accountId, accountId),
        eq(transactionsTable.userId, userId),
      ),
    )
    .limit(1);
  if (!orig) throw new LedgerPolicyError("TX_NOT_FOUND", "原成交记录不存在。", 404);
  if (orig.reversesTxId) {
    throw new LedgerPolicyError("ALREADY_REVERSED", "冲销记录不可再次冲销。", 409);
  }
  const [existingRev] = await tx
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(eq(transactionsTable.reversesTxId, orig.id))
    .limit(1);
  if (existingRev) {
    throw new LedgerPolicyError("ALREADY_REVERSED", "该成交已被冲销，禁止重复冲销。", 409);
  }
  return orig;
}

/** Appends a single reversing transaction and deterministically replays the entire account (U1-1). */
export async function reversePortfolioTransaction(
  db: KanonDb,
  input: { accountId: string; userId: string; transactionId: string; note?: string },
) {
  return runInTransaction(db, async (tx) => {
    const acct = await lockAccountForUpdate(tx, input.accountId, input.userId);
    const orig = await loadReversibleTx(tx, acct.id, input.userId, input.transactionId);
    if (!orig.tradeCurrency || orig.fxToBase === null || !orig.fxSource) {
      throw new LedgerPolicyError("CURRENCY_UNCONFIRMED", "原成交缺少币种或汇率，无法冲销。", 409);
    }
    const revId = `tx_rev_${crypto.randomUUID()}`;
    const { cashBalance } = await replayAndCommitAccountTransaction(tx, {
      accountId: acct.id,
      userId: input.userId,
      asOfDate: todayIsoUtc(),
      newTx: {
        id: revId,
        thesisId: orig.thesisId,
        ticker: normalizeCanonicalTicker(orig.ticker),
        action: orig.action,
        quantity: orig.quantity,
        price: orig.price,
        fees: orig.fees,
        tradeCurrency: orig.tradeCurrency,
        fxToBase: orig.fxToBase,
        fxSource: orig.fxSource,
        reversesTxId: orig.id,
        tradeDate: orig.tradeDate,
        createdAtMs: Date.now(),
        externalRef: null,
        noLeverageConfirmed: true,
        note: input.note?.trim() || `冲销 ${orig.id}`,
      },
    });
    return { reversalTransactionId: revId, reversedTransactionId: orig.id, cashBalance };
  });
}
