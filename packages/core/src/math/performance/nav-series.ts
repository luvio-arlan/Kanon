import type { NavBasis, NavPoint, PortfolioPerformanceResponse } from "../../contracts/analytics";
import type { CurrencyCode } from "../../contracts/intel/primitives";
import { roundTo } from "../valuation-scenarios";
import type { CashDividendEvent, CloseBarPoint } from "./benchmark-tr";
import { detectUnrecordedDividends } from "./dividend-audit";
import {
  accumulateDailyFxAttribution,
  collectFxGaps,
  computeBenchmarkAndSeries,
  type DailyFxRatePoint,
  type DailyPositionMark,
} from "./fx-attribution";
import { linkFxContributionCarino } from "./fx-contribution";
import { type ReplayTxInput, type SplitActionInput, sortReplayTxs } from "./ledger-replay";
import {
  applyDayTxs,
  buildCloseLookup,
  buildUnavailablePerformanceResponse,
  emptyPerformance,
  groupTxsByDay,
  type HoldingState,
  markEquityValue,
  snapshotShares,
} from "./nav-helpers";
import { detectSplitRebaseCliffs, normalizeTransactionsToSplitBasis } from "./split-basis";

export interface PerformanceSeriesInput {
  accountId: string;
  baseCurrency?: CurrencyCode;
  transactions: readonly ReplayTxInput[];
  barsByTicker: ReadonlyMap<string, readonly CloseBarPoint[]>;
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>;
  dividendsByTicker: ReadonlyMap<string, readonly CashDividendEvent[]>;
  fxRatesByCurrency?: ReadonlyMap<string, readonly DailyFxRatePoint[]>;
  spyBars: readonly CloseBarPoint[];
  spyDividends: readonly CashDividendEvent[];
  asOfDate: string;
}

interface RawNavRow {
  date: string;
  nav: number;
  cash: number;
  equityValue: number;
  netFlow: number;
  basis: NavBasis;
}

function collectDateGrid(input: PerformanceSeriesInput, firstTxDate: string): string[] {
  const dateSet = new Set<string>();
  const addIfInRange = (d: string) => {
    if (d >= firstTxDate && d <= input.asOfDate) dateSet.add(d);
  };
  for (const tx of input.transactions) addIfInRange(tx.tradeDate);
  for (const b of input.spyBars) addIfInRange(b.barDate);
  for (const bars of input.barsByTicker.values()) for (const b of bars) addIfInRange(b.barDate);
  if (dateSet.size === 0) dateSet.add(firstTxDate);
  return [...dateSet].sort((a, b) => a.localeCompare(b));
}

function simulateDailyNav(
  input: PerformanceSeriesInput,
  normalizedTxs: readonly ReplayTxInput[],
  dates: readonly string[],
) {
  const txsByDay = groupTxsByDay(normalizedTxs);
  const closeLookup = buildCloseLookup(input.barsByTicker);
  const holdings = new Map<string, HoldingState>();
  const lastClose = new Map<string, number>();
  const sharesAtDate = new Map<string, Map<string, number>>();
  const baseCurrency = input.baseCurrency ?? "USD";
  let cash = 0;
  const dailyFxBase: number[] = [];
  let prevMarks = new Map<string, DailyPositionMark>();
  const rawPoints: RawNavRow[] = [];
  const fxMissingByDay = new Map<string, Set<string>>();

  for (const day of dates) {
    sharesAtDate.set(day, snapshotShares(holdings));
    const dayFlow = applyDayTxs({ dayTxs: txsByDay.get(day) ?? [], holdings, baseCurrency });
    cash = roundTo(cash + dayFlow.cashDelta, 2);
    const marked = markEquityValue({
      day,
      holdings,
      closeLookup,
      lastClose,
      baseCurrency,
      fxRatesByCurrency: input.fxRatesByCurrency,
    });
    const attr = accumulateDailyFxAttribution({
      prevByTicker: prevMarks,
      currByTicker: marked.marksByTicker,
      dayTradeFlowBaseByTicker: dayFlow.dayTradeFlowBaseByTicker,
    });
    dailyFxBase.push(attr.fxDelta);
    prevMarks = marked.marksByTicker;
    if (marked.fxMissingCurrencies.size > 0) fxMissingByDay.set(day, marked.fxMissingCurrencies);
    rawPoints.push({
      date: day,
      nav: roundTo(cash + marked.equityValue, 2),
      cash,
      equityValue: roundTo(marked.equityValue, 2),
      netFlow: roundTo(dayFlow.netFlow, 2),
      basis: marked.basis,
    });
  }
  return { rawPoints, sharesAtDate, dailyFxBase, fxMissingByDay };
}

function resolveOverallBasis(series: readonly NavPoint[]): NavBasis {
  if (series.some((p) => p.basis === "fx_stale")) return "fx_stale";
  if (series.some((p) => p.basis === "cost_fallback")) return "cost_fallback";
  return series.some((p) => p.basis === "partial_bars") ? "partial_bars" : "full_bars";
}

function hasHeldSplitCliff(
  sortedTxs: readonly ReplayTxInput[],
  input: PerformanceSeriesInput,
): boolean {
  const heldTickers = new Set(
    sortedTxs.filter((t) => t.action === "buy").map((t) => t.ticker.trim().toUpperCase()),
  );
  return detectSplitRebaseCliffs(input.barsByTicker, input.splitsByTicker).some((t) =>
    heldTickers.has(t),
  );
}

interface ReadyPerfArgs {
  input: PerformanceSeriesInput;
  baseCurrency: CurrencyCode;
  sortedTxs: readonly ReplayTxInput[];
  dates: readonly string[];
  rawPoints: readonly RawNavRow[];
  sharesAtDate: ReadonlyMap<string, ReadonlyMap<string, number>>;
  dailyFxBase: readonly number[];
}

function buildReadyResponse(p: ReadyPerfArgs): PortfolioPerformanceResponse {
  const { twr, dd, series } = computeBenchmarkAndSeries({
    spyBars: p.input.spyBars,
    spyDividends: p.input.spyDividends,
    fxRatesByCurrency: p.input.fxRatesByCurrency,
    baseCurrency: p.baseCurrency,
    dates: p.dates,
    rawPoints: p.rawPoints,
  });
  const last = series[series.length - 1];
  const spyTrPct = last?.spyTrCumPct ?? null;
  const fxAmount = p.dailyFxBase.reduce((acc, v) => acc + v, 0);
  const totalPnl = (last?.nav ?? 0) - p.rawPoints.reduce((acc, row) => acc + row.netFlow, 0);
  const linked = linkFxContributionCarino(p.rawPoints, p.dailyFxBase);
  return {
    accountId: p.input.accountId,
    baseCurrency: p.baseCurrency,
    status: twr.tradingDays > 0 || (last?.nav ?? 0) > 0 ? "ready" : "insufficient_bars",
    totalNav: last?.nav ?? 0,
    cashBalance: last?.cash ?? 0,
    equityValue: last?.equityValue ?? 0,
    twrPct: twr.twrPct,
    modifiedDietzPct: twr.modifiedDietzPct,
    annualizedTwrPct: twr.annualizedTwrPct,
    spyTrPct,
    excessReturnPct:
      twr.twrPct !== null && spyTrPct !== null ? roundTo(twr.twrPct - spyTrPct, 2) : null,
    localContribution: roundTo(totalPnl - fxAmount, 2),
    fxContribution: roundTo(fxAmount, 2),
    localContributionPct: linked?.localPct ?? null,
    fxContributionPct: linked?.fxPct ?? null,
    maxDrawdownPct: dd.maxDrawdownPct,
    maxDrawdownPeakDate: dd.peakDate,
    maxDrawdownTroughDate: dd.troughDate,
    currentDrawdownPct: dd.currentDrawdownPct,
    tradingDays: twr.tradingDays,
    basis: resolveOverallBasis(series),
    series,
    fxGaps: [],
    unrecordedDividends: detectUnrecordedDividends({
      transactions: p.sortedTxs,
      dividendsByTicker: p.input.dividendsByTicker,
      sharesAtDate: p.sharesAtDate,
    }),
  };
}

/**
 * Builds daily NAV, TWR, Modified Dietz, Max Drawdown, FX attribution, and base-currency SPY comparison
 * on a unified latest split-adjusted close-bar basis (never `.adjClose` — U0-5 / U1-1 / G16 / G23).
 */
export function buildPortfolioPerformanceSeries(
  input: PerformanceSeriesInput,
): PortfolioPerformanceResponse {
  const baseCurrency = input.baseCurrency ?? "USD";
  const sortedTxs = sortReplayTxs(input.transactions);
  if (sortedTxs.length === 0) return emptyPerformance(input.accountId, baseCurrency);
  const normalizedTxs = normalizeTransactionsToSplitBasis(sortedTxs, input.splitsByTicker);
  const dates = collectDateGrid(input, sortedTxs[0]?.tradeDate ?? input.asOfDate);
  const sim = simulateDailyNav(input, normalizedTxs, dates);
  if (hasHeldSplitCliff(sortedTxs, input)) {
    return buildUnavailablePerformanceResponse(
      input.accountId,
      baseCurrency,
      sim.rawPoints,
      "rebase_pending",
    );
  }
  if (sim.fxMissingByDay.size > 0) {
    return buildUnavailablePerformanceResponse(
      input.accountId,
      baseCurrency,
      sim.rawPoints,
      "fx_stale",
      collectFxGaps(dates, sim.fxMissingByDay),
    );
  }
  return buildReadyResponse({ input, baseCurrency, sortedTxs, dates, ...sim });
}
