import {
  buildPortfolioPerformanceSeries,
  CurrencyCodeSchema,
  inferCurrencyFromTicker,
  PortfolioPerformanceResponseSchema,
  todayIsoUtc,
} from "@kanon/core";
import {
  type KanonDb,
  loadFxRatesHistory,
  loadTenantAccountAndTransactions,
  loadUnadjustedMarketDataForTickers,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

function noAccountPerformance() {
  return PortfolioPerformanceResponseSchema.parse({
    accountId: null,
    status: "no_account",
    totalNav: null,
    cashBalance: null,
    equityValue: null,
    twrPct: null,
    modifiedDietzPct: null,
    annualizedTwrPct: null,
    spyTrPct: null,
    excessReturnPct: null,
    maxDrawdownPct: null,
    maxDrawdownPeakDate: null,
    maxDrawdownTroughDate: null,
    currentDrawdownPct: null,
    tradingDays: 0,
    basis: "empty",
    series: [],
    unrecordedDividends: [],
  });
}

async function loadPerformanceContext(tx: KanonDb, userId: string, accountId: string | null) {
  const { account, transactions } = await loadTenantAccountAndTransactions(tx, userId, accountId);
  if (!account) return null;
  const tickers = transactions.map((t) => t.ticker).filter((t) => t !== "CASH");
  const currencies = [
    account.baseCurrency,
    ...transactions.map((t) => t.tradeCurrency ?? inferCurrencyFromTicker(t.ticker) ?? "USD"),
  ];
  const [market, fxRatesByCurrency] = await Promise.all([
    loadUnadjustedMarketDataForTickers(tx, tickers),
    loadFxRatesHistory(tx, currencies),
  ]);
  return { account, transactions, market, fxRatesByCurrency };
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || null;
  const loaded = await auth.withDb((tx) => loadPerformanceContext(tx, auth.user.id, accountId));
  if (!loaded) return jsonOk(noAccountPerformance(), startedAt);
  const parsedCur = CurrencyCodeSchema.safeParse(loaded.account.baseCurrency.toUpperCase());
  const perf = buildPortfolioPerformanceSeries({
    accountId: loaded.account.id,
    baseCurrency: parsedCur.success ? parsedCur.data : "USD",
    transactions: loaded.transactions.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      action: t.action,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      tradeCurrency: t.tradeCurrency,
      fxToBase: t.fxToBase,
      reversesTxId: t.reversesTxId,
      tradeDate: t.tradeDate,
      createdAtMs: t.createdAt.getTime(),
    })),
    barsByTicker: loaded.market.barsByTicker,
    splitsByTicker: loaded.market.splitsByTicker,
    dividendsByTicker: loaded.market.dividendsByTicker,
    fxRatesByCurrency: loaded.fxRatesByCurrency,
    spyBars: loaded.market.spyBars,
    spyDividends: loaded.market.spyDividends,
    asOfDate: todayIsoUtc(),
  });
  return jsonOk(PortfolioPerformanceResponseSchema.parse(perf), startedAt);
}
