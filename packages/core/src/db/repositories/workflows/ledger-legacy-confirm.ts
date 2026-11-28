import { and, eq } from "drizzle-orm";
import { type CurrencyCode, inferCurrencyFromTicker } from "../../../contracts/intel/primitives";
import { todayIsoUtc } from "../../../contracts/workflow-contracts";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import { portfolioAccountsTable, transactionsTable } from "../../schema";
import { lookupFxToBaseOnDate } from "../portfolio/fx-rates-reader";
import { replayAndCommitAccountTransaction } from "../portfolio/ledger-replay-store";
import { LedgerPolicyError, lockAccountRowForUpdate } from "./ledger-fifo-helpers";

export type LegacyCurrencyMode = "as_base" | "infer_by_ticker";

function inferRowCurrency(ticker: string, base: CurrencyCode): CurrencyCode | null {
  return ticker === "CASH" ? base : inferCurrencyFromTicker(ticker);
}

/**
 * Rows to repair: NULL currency, or (infer mode) rows back-filled as `identity` whose numeric-exchange
 * ticker says otherwise — `0034`/`0035` missed canonical `0700-HK` and stamped them USD × 1.
 */
function needsCurrencyRepair(
  row: { ticker: string; tradeCurrency: string | null; fxSource: string | null },
  base: CurrencyCode,
  mode: LegacyCurrencyMode,
): boolean {
  if (row.tradeCurrency === null) return true;
  if (mode === "as_base" || row.fxSource !== "identity") return false;
  const inferred = inferRowCurrency(row.ticker, base);
  return inferred !== null && inferred !== row.tradeCurrency;
}

async function repairRowCurrency(
  tx: KanonDb,
  row: { id: string; accountId: string; ticker: string; tradeDate: string },
  base: CurrencyCode,
  mode: LegacyCurrencyMode,
) {
  const currency = mode === "as_base" ? base : inferRowCurrency(row.ticker, base);
  if (!currency) {
    throw new LedgerPolicyError("CURRENCY_UNSUPPORTED", `暂不支持 ${row.ticker} 的交易币种。`);
  }
  const fx = await lookupFxToBaseOnDate(tx, {
    fromCurrency: currency,
    toCurrency: base,
    asOfDate: row.tradeDate,
  });
  if (!fx) {
    throw new LedgerPolicyError(
      "FX_UNAVAILABLE",
      `缺少 ${currency}/${base} 在 ${row.tradeDate} 附近的 ECB 参考汇率。`,
      409,
    );
  }
  await tx
    .update(transactionsTable)
    .set({ tradeCurrency: currency, fxToBase: fx.rate, fxSource: fx.source })
    .where(and(eq(transactionsTable.id, row.id), eq(transactionsTable.accountId, row.accountId)));
}

/**
 * One-shot owner confirmation for legacy `ledger_inconsistent` accounts (V0-4): fills every NULL-currency
 * row with an explicit currency + ECB rate (never guessed silently), re-replays the whole ledger under the
 * zero-leverage cash path, and only then clears the flag. Any missing rate aborts the whole confirmation.
 */
export async function confirmLegacyAccountCurrency(
  db: KanonDb,
  input: { accountId: string; userId: string; mode: LegacyCurrencyMode },
): Promise<{ updatedTransactions: number; cashBalance: number }> {
  return runInTransaction(db, async (tx) => {
    const acct = await lockAccountRowForUpdate(tx, input.accountId, input.userId);
    const base = acct.baseCurrency;
    if (!acct.unconfirmed) {
      throw new LedgerPolicyError("ALREADY_CONFIRMED", "账户币种已确认。", 409);
    }
    if (!base) {
      throw new LedgerPolicyError(
        "BASE_CURRENCY_UNSUPPORTED",
        "账户本币不受支持，请新建账户。",
        409,
      );
    }
    const all = await tx
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.accountId, acct.id));
    const rows = all.filter((row) => needsCurrencyRepair(row, base, input.mode));
    for (const row of rows) await repairRowCurrency(tx, row, base, input.mode);
    const { cashBalance } = await replayAndCommitAccountTransaction(tx, {
      accountId: acct.id,
      userId: input.userId,
      asOfDate: todayIsoUtc(),
    });
    await tx
      .update(portfolioAccountsTable)
      .set({ ledgerInconsistent: false })
      .where(
        and(
          eq(portfolioAccountsTable.id, acct.id),
          eq(portfolioAccountsTable.userId, input.userId),
        ),
      );
    return { updatedTransactions: rows.length, cashBalance };
  });
}
