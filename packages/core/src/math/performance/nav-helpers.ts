import type { NavBasis, PortfolioPerformanceResponse } from "../../contracts/analytics";
import { type CurrencyCode, inferCurrencyFromTicker } from "../../contracts/intel/primitives";
import type { CloseBarPoint } from "./benchmark-tr";
import {
  type DailyFxRatePoint,
  type DailyPositionMark,
  resolveCrossFxRateOnDate,
} from "./fx-attribution";
import { computeTxCashDelta, type ReplayTxInput } from "./ledger-replay";

export interface HoldingState {
  shares: number;
  totalCost: number;
  currency: string;
}

export function buildCloseLookup(barsByTicker: ReadonlyMap<string, readonly CloseBarPoint[]>) {
  const map = new Map<string, Map<string, number>>();
  for (const [ticker, bars] of barsByTicker) {
    const m = new Map<string, number>();
    for (const b of bars) if (Number.isFinite(b.close) && b.close > 0) m.set(b.barDate, b.close);
    map.set(ticker, m);
  }
  return map;
}

function applySingleDayTx(
  tx: ReplayTxInput,
  holdings: Map<string, HoldingState>,
  dayTradeFlowBaseByTicker: Map<string, number>,
  baseCurrency: CurrencyCode,
) {
  const ticker = tx.ticker.trim().toUpperCase();
  const fx = tx.fxToBase && tx.fxToBase > 0 ? tx.fxToBase : 1;
  if (tx.action === "buy") {
    const currency = tx.tradeCurrency ?? inferCurrencyFromTicker(ticker) ?? baseCurrency;
    const cur = holdings.get(ticker) ?? { shares: 0, totalCost: 0, currency };
    const outlay = (tx.quantity * tx.price + tx.fees) * fx;
    cur.shares += tx.quantity;
    cur.totalCost += outlay;
    cur.currency = currency;
    holdings.set(ticker, cur);
    dayTradeFlowBaseByTicker.set(ticker, (dayTradeFlowBaseByTicker.get(ticker) ?? 0) + outlay);
    return;
  }
  if (tx.action !== "sell") return;
  const cur = holdings.get(ticker);
  if (!cur || cur.shares <= 1e-8) return;
  const avg = cur.totalCost / cur.shares;
  const proceeds = (tx.quantity * tx.price - tx.fees) * fx;
  cur.shares = Math.max(0, cur.shares - tx.quantity);
  cur.totalCost = Math.max(0, cur.shares * avg);
  dayTradeFlowBaseByTicker.set(ticker, (dayTradeFlowBaseByTicker.get(ticker) ?? 0) - proceeds);
}

/**
 * Applies split-basis-normalized daily transactions to holdings & cash in account base currency.
 * Splits are normalized up front in `split-basis.ts` so the NAV loop NEVER mutates shares on ex-dates (U0-5 / G23).
 */
export function applyDayTxs(params: {
  dayTxs: readonly ReplayTxInput[];
  holdings: Map<string, HoldingState>;
  baseCurrency?: CurrencyCode;
}): { cashDelta: number; netFlow: number; dayTradeFlowBaseByTicker: Map<string, number> } {
  let cashDelta = 0;
  let netFlow = 0;
  const dayTradeFlowBaseByTicker = new Map<string, number>();
  const baseCurrency = params.baseCurrency ?? "USD";
  for (const tx of params.dayTxs) {
    const delta = computeTxCashDelta(tx);
    cashDelta += delta;
    if (tx.action === "deposit" || tx.action === "withdraw") netFlow += delta;
    applySingleDayTx(tx, params.holdings, dayTradeFlowBaseByTicker, baseCurrency);
  }
  return { cashDelta, netFlow, dayTradeFlowBaseByTicker };
}

function markSingleHolding(
  ticker: string,
  h: HoldingState,
  exact: number | undefined,
  lastClose: Map<string, number>,
  fxRate: number | null,
): {
  value: number;
  kind: "exact" | "stale" | "cost" | "fx_stale";
  mark: DailyPositionMark | null;
} {
  if (fxRate === null) {
    return { value: h.totalCost, kind: "fx_stale", mark: null };
  }
  if (exact !== undefined) {
    lastClose.set(ticker, exact);
    return {
      value: h.shares * exact * fxRate,
      kind: "exact",
      mark: { ticker, shares: h.shares, localPrice: exact, fxToBase: fxRate },
    };
  }
  const prev = lastClose.get(ticker);
  if (prev !== undefined) {
    return {
      value: h.shares * prev * fxRate,
      kind: "stale",
      mark: { ticker, shares: h.shares, localPrice: prev, fxToBase: fxRate },
    };
  }
  return { value: h.totalCost, kind: "cost", mark: null };
}

function resolveBasisFromCounts(counts: {
  fxStale: number;
  cost: number;
  stale: number;
}): NavBasis {
  if (counts.fxStale > 0) return "fx_stale";
  if (counts.cost > 0) return "cost_fallback";
  return counts.stale > 0 ? "partial_bars" : "full_bars";
}

function recordBasisCount(
  counts: { fxStale: number; cost: number; stale: number },
  kind: "exact" | "stale" | "cost" | "fx_stale",
) {
  if (kind === "fx_stale") counts.fxStale += 1;
  else if (kind === "cost") counts.cost += 1;
  else if (kind === "stale") counts.stale += 1;
}

export function markEquityValue(params: {
  day: string;
  holdings: ReadonlyMap<string, HoldingState>;
  closeLookup: ReadonlyMap<string, ReadonlyMap<string, number>>;
  lastClose: Map<string, number>;
  baseCurrency?: CurrencyCode;
  fxRatesByCurrency?: ReadonlyMap<string, readonly DailyFxRatePoint[]>;
}): { equityValue: number; basis: NavBasis; marksByTicker: Map<string, DailyPositionMark> } {
  let equityValue = 0;
  const counts = { fxStale: 0, cost: 0, stale: 0 };
  const marksByTicker = new Map<string, DailyPositionMark>();
  const baseCurrency = params.baseCurrency ?? "USD";
  const fxMap = params.fxRatesByCurrency ?? new Map();
  for (const [ticker, h] of params.holdings) {
    if (h.shares <= 1e-6) continue;
    const fxRate = resolveCrossFxRateOnDate(h.currency, baseCurrency, params.day, fxMap);
    const marked = markSingleHolding(
      ticker,
      h,
      params.closeLookup.get(ticker)?.get(params.day),
      params.lastClose,
      fxRate,
    );
    equityValue += marked.value;
    if (marked.mark) marksByTicker.set(ticker, marked.mark);
    recordBasisCount(counts, marked.kind);
  }
  return { equityValue, basis: resolveBasisFromCounts(counts), marksByTicker };
}

export function groupTxsByDay(txs: readonly ReplayTxInput[]): Map<string, ReplayTxInput[]> {
  const txsByDay = new Map<string, ReplayTxInput[]>();
  for (const tx of txs) {
    const arr = txsByDay.get(tx.tradeDate) ?? [];
    arr.push(tx);
    txsByDay.set(tx.tradeDate, arr);
  }
  return txsByDay;
}

export function snapshotShares(holdings: ReadonlyMap<string, HoldingState>): Map<string, number> {
  const snap = new Map<string, number>();
  for (const [t, h] of holdings) if (h.shares > 1e-6) snap.set(t, h.shares);
  return snap;
}

export function emptyPerformance(
  accountId: string,
  baseCurrency: CurrencyCode = "USD",
): PortfolioPerformanceResponse {
  return buildUnavailablePerformanceResponse(accountId, baseCurrency, [], "empty");
}

export function buildUnavailablePerformanceResponse(
  accountId: string,
  baseCurrency: CurrencyCode,
  rawPoints: ReadonlyArray<{
    date: string;
    nav: number;
    cash: number;
    equityValue: number;
    netFlow: number;
    basis: NavBasis;
  }>,
  basis: "rebase_pending" | "fx_stale" | "empty",
): PortfolioPerformanceResponse {
  const last = rawPoints[rawPoints.length - 1];
  return {
    accountId,
    baseCurrency,
    status: basis === "empty" ? "empty" : "insufficient_bars",
    totalNav: last?.nav ?? 0,
    cashBalance: last?.cash ?? 0,
    equityValue: last?.equityValue ?? 0,
    twrPct: null,
    modifiedDietzPct: null,
    annualizedTwrPct: null,
    spyTrPct: null,
    excessReturnPct: null,
    localContribution: null,
    fxContribution: null,
    localContributionPct: null,
    fxContributionPct: null,
    maxDrawdownPct: null,
    maxDrawdownPeakDate: null,
    maxDrawdownTroughDate: null,
    currentDrawdownPct: null,
    tradingDays: 0,
    basis,
    series: rawPoints.map((p) => ({
      ...p,
      twrCumPct: null,
      spyTrCumPct: null,
      drawdownPct: null,
    })),
    unrecordedDividends: [],
  };
}
