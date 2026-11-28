import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { CashDividendEvent, CloseBarPoint, SplitActionInput } from "../../../math/performance";
import type { KanonDb } from "../../bootstrap";
import {
  corporateActionsTable,
  portfolioAccountsTable,
  priceBarsDailyTable,
  securitiesTable,
  transactionsTable,
} from "../../schema";
import { normalizeCanonicalTicker } from "../enterprise/ic-and-compliance-store";

export interface LoadedMarketData {
  barsByTicker: Map<string, CloseBarPoint[]>;
  splitsByTicker: Map<string, SplitActionInput[]>;
  dividendsByTicker: Map<string, CashDividendEvent[]>;
  spyBars: CloseBarPoint[];
  spyDividends: CashDividendEvent[];
  latestCloseByTicker: Map<string, number>;
}

function indexBarRows(
  barRows: ReadonlyArray<{ securityId: string; barDate: string; close: number }>,
  tickerById: ReadonlyMap<string, string>,
) {
  const barsByTicker = new Map<string, CloseBarPoint[]>();
  const latestCloseByTicker = new Map<string, number>();
  for (const r of barRows) {
    const ticker = tickerById.get(r.securityId);
    if (!ticker || !Number.isFinite(r.close) || r.close <= 0) continue;
    const arr = barsByTicker.get(ticker) ?? [];
    arr.push({ barDate: r.barDate, close: r.close });
    barsByTicker.set(ticker, arr);
    latestCloseByTicker.set(ticker, r.close);
  }
  return { barsByTicker, latestCloseByTicker };
}

function indexActionRows(
  actionRows: ReadonlyArray<{
    securityId: string;
    exDate: string;
    kind: string;
    ratio: number | null;
    amount: number | null;
  }>,
  tickerById: ReadonlyMap<string, string>,
) {
  const splitsByTicker = new Map<string, SplitActionInput[]>();
  const dividendsByTicker = new Map<string, CashDividendEvent[]>();
  for (const a of actionRows) {
    const ticker = tickerById.get(a.securityId);
    if (!ticker) continue;
    if (a.kind === "split" && a.ratio && a.ratio > 0) {
      const arr = splitsByTicker.get(ticker) ?? [];
      arr.push({ exDate: a.exDate, ratio: a.ratio });
      splitsByTicker.set(ticker, arr);
    } else if (a.kind === "dividend" && a.amount && a.amount > 0) {
      const arr = dividendsByTicker.get(ticker) ?? [];
      arr.push({ exDate: a.exDate, amount: a.amount });
      dividendsByTicker.set(ticker, arr);
    }
  }
  return { splitsByTicker, dividendsByTicker };
}

function queryBarsAndActions(tx: KanonDb, secIds: readonly string[], barsFromDate?: string) {
  return Promise.all([
    tx
      .select({
        securityId: priceBarsDailyTable.securityId,
        barDate: priceBarsDailyTable.barDate,
        close: priceBarsDailyTable.close,
      })
      .from(priceBarsDailyTable)
      .where(
        and(
          inArray(priceBarsDailyTable.securityId, [...secIds]),
          barsFromDate ? gte(priceBarsDailyTable.barDate, barsFromDate) : undefined,
        ),
      )
      .orderBy(asc(priceBarsDailyTable.barDate)),
    tx
      .select()
      .from(corporateActionsTable)
      .where(inArray(corporateActionsTable.securityId, [...secIds]))
      .orderBy(asc(corporateActionsTable.exDate)),
  ]);
}

/** Loads split-basis daily closes + corporate actions (splits/dividends) for tickers + SPY (NEVER adjClose — U0-5 / G16). */
export async function loadUnadjustedMarketDataForTickers(
  tx: KanonDb,
  tickers: readonly string[],
  barsFromDate?: string,
): Promise<LoadedMarketData> {
  const unique = [
    ...new Set(["SPY", ...tickers.map(normalizeCanonicalTicker).filter((t) => t && t !== "CASH")]),
  ];
  const secs = await tx
    .select({ id: securitiesTable.id, ticker: securitiesTable.ticker })
    .from(securitiesTable)
    .where(inArray(securitiesTable.ticker, unique));
  if (secs.length === 0) {
    return {
      barsByTicker: new Map(),
      splitsByTicker: new Map(),
      dividendsByTicker: new Map(),
      spyBars: [],
      spyDividends: [],
      latestCloseByTicker: new Map(),
    };
  }
  const tickerById = new Map(secs.map((s) => [s.id, normalizeCanonicalTicker(s.ticker)]));
  const [barRows, actionRows] = await queryBarsAndActions(
    tx,
    secs.map((s) => s.id),
    barsFromDate,
  );
  const { barsByTicker, latestCloseByTicker } = indexBarRows(barRows, tickerById);
  const { splitsByTicker, dividendsByTicker } = indexActionRows(actionRows, tickerById);
  return {
    barsByTicker,
    splitsByTicker,
    dividendsByTicker,
    spyBars: barsByTicker.get("SPY") ?? [],
    spyDividends: dividendsByTicker.get("SPY") ?? [],
    latestCloseByTicker,
  };
}

/** Loads the primary (or requested) portfolio account and its chronological transactions for a tenant. */
export async function loadTenantAccountAndTransactions(
  tx: KanonDb,
  userId: string,
  accountId?: string | null,
) {
  const accounts = await tx
    .select()
    .from(portfolioAccountsTable)
    .where(eq(portfolioAccountsTable.userId, userId))
    .orderBy(asc(portfolioAccountsTable.createdAt));
  const account = accountId ? accounts.find((a) => a.id === accountId) : accounts[0];
  if (!account) return { account: null, transactions: [] };
  const transactions = await tx
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.accountId, account.id))
    .orderBy(asc(transactionsTable.tradeDate), asc(transactionsTable.createdAt));
  return { account, transactions };
}
