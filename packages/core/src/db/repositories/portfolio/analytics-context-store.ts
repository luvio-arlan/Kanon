import {
  type CurrencyCode,
  CurrencyCodeSchema,
  inferCurrencyFromTicker,
} from "../../../contracts/intel/primitives";
import type { ReplayTxInput } from "../../../math/performance";
import type { KanonDb } from "../../bootstrap";
import type { transactionsTable } from "../../schema";
import { normalizeCanonicalTicker } from "../enterprise/ic-and-compliance-store";
import { loadFxRatesHistory } from "./fx-rates-reader";
import {
  type LoadedMarketData,
  loadTenantAccountAndTransactions,
  loadUnadjustedMarketDataForTickers,
} from "./performance-inputs-store";

type TransactionRow = typeof transactionsTable.$inferSelect;

export type AnalyticsTxInput = ReplayTxInput & { thesisId: string | null };

/**
 * The ONLY row → replay-input mapping for portfolio analytics (G33). Performance, risk and attribution must
 * all see identical currency, FX, reversal and opening-balance semantics (V0-3).
 */
export function toReplayTxInput(t: TransactionRow): AnalyticsTxInput {
  return {
    id: t.id,
    thesisId: t.thesisId,
    ticker: normalizeCanonicalTicker(t.ticker),
    action: t.action,
    quantity: t.quantity,
    price: t.price,
    fees: t.fees,
    tradeCurrency: t.tradeCurrency,
    fxToBase: t.fxToBase,
    reversesTxId: t.reversesTxId,
    tradeDate: t.tradeDate,
    createdAtMs: t.createdAt.getTime(),
    isOpeningBalance: t.externalRef === "opening_balance",
  };
}

export type PortfolioAnalyticsContext =
  | { kind: "no_account" }
  | { kind: "currency_unconfirmed"; accountId: string }
  | {
      kind: "ready";
      accountId: string;
      baseCurrency: CurrencyCode;
      transactions: AnalyticsTxInput[];
      market: LoadedMarketData;
      fxRatesByCurrency: Awaited<ReturnType<typeof loadFxRatesHistory>>;
      currencies: CurrencyCode[];
      firstTradeDate: string | null;
    };

function shiftIsoDays(iso: string, delta: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Loads one tenant account plus bounded market + FX history for analytics. Legacy accounts flagged
 * `ledger_inconsistent` (or with an unsupported base currency) are never computed: they return
 * `currency_unconfirmed` until the owner confirms currencies (V0-4) — no silent `fx = 1` / USD fallback.
 */
export async function loadPortfolioAnalyticsContext(
  tx: KanonDb,
  params: { userId: string; accountId: string | null; minHistoryFromDate?: string },
): Promise<PortfolioAnalyticsContext> {
  const { account, transactions } = await loadTenantAccountAndTransactions(
    tx,
    params.userId,
    params.accountId,
  );
  if (!account) return { kind: "no_account" };
  const base = CurrencyCodeSchema.safeParse(account.baseCurrency.trim().toUpperCase());
  if (account.ledgerInconsistent || !base.success) {
    return { kind: "currency_unconfirmed", accountId: account.id };
  }
  const mapped = transactions.map(toReplayTxInput);
  const firstTradeDate = mapped[0]?.tradeDate ?? null;
  const fromCandidates = [firstTradeDate, params.minHistoryFromDate].filter(
    (d): d is string => typeof d === "string",
  );
  const historyFrom = fromCandidates.length > 0 ? fromCandidates.sort()[0] : undefined;
  const currencies = [
    ...new Set<CurrencyCode>([
      base.data,
      ...mapped.flatMap((t) => {
        const c = t.tradeCurrency ?? inferCurrencyFromTicker(t.ticker);
        const parsed = CurrencyCodeSchema.safeParse(c ?? "");
        return parsed.success ? [parsed.data] : [];
      }),
    ]),
  ];
  const tickers = mapped.map((t) => t.ticker).filter((t) => t !== "CASH");
  const [market, fxRatesByCurrency] = await Promise.all([
    loadUnadjustedMarketDataForTickers(
      tx,
      tickers,
      historyFrom ? shiftIsoDays(historyFrom, -10) : undefined,
    ),
    loadFxRatesHistory(tx, currencies, historyFrom),
  ]);
  return {
    kind: "ready",
    accountId: account.id,
    baseCurrency: base.data,
    transactions: mapped,
    market,
    fxRatesByCurrency,
    currencies,
    firstTradeDate,
  };
}
