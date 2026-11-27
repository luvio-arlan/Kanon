import type { NavBasis, NavPoint, PortfolioPerformanceResponse } from "../../contracts/analytics";
import { roundTo } from "../valuation-scenarios";
import {
  buildTotalReturnIndex,
  type CashDividendEvent,
  type CloseBarPoint,
  rebaseTotalReturnPct,
} from "./benchmark-tr";
import { detectUnrecordedDividends } from "./dividend-audit";
import { computeMaxDrawdown } from "./drawdown";
import type { ReplayTxInput, SplitActionInput } from "./ledger-replay";
import {
  applyDayTxsAndSplits,
  buildCloseLookup,
  type HoldingState,
  markEquityValue,
} from "./nav-helpers";
import { computeDailyTwr } from "./twr";

export interface PerformanceSeriesInput {
  accountId: string;
  transactions: readonly ReplayTxInput[];
  barsByTicker: ReadonlyMap<string, readonly CloseBarPoint[]>;
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>;
  dividendsByTicker: ReadonlyMap<string, readonly CashDividendEvent[]>;
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
  sortedTxs: readonly ReplayTxInput[],
  dates: readonly string[],
) {
  const txsByDay = new Map<string, ReplayTxInput[]>();
  for (const tx of sortedTxs) {
    const arr = txsByDay.get(tx.tradeDate) ?? [];
    arr.push(tx);
    txsByDay.set(tx.tradeDate, arr);
  }
  const closeLookup = buildCloseLookup(input.barsByTicker);
  const holdings = new Map<string, HoldingState>();
  const lastClose = new Map<string, number>();
  const appliedSplits = new Set<string>();
  const sharesAtDate = new Map<string, Map<string, number>>();
  let cash = 0;
  const rawPoints: RawNavRow[] = [];

  for (const day of dates) {
    const snap = new Map<string, number>();
    for (const [t, h] of holdings) if (h.shares > 1e-6) snap.set(t, h.shares);
    sharesAtDate.set(day, snap);
    const { cashDelta, netFlow } = applyDayTxsAndSplits({
      day,
      dayTxs: txsByDay.get(day) ?? [],
      holdings,
      splitsByTicker: input.splitsByTicker,
      appliedSplits,
    });
    cash = roundTo(cash + cashDelta, 2);
    const { equityValue, basis } = markEquityValue({ day, holdings, closeLookup, lastClose });
    rawPoints.push({
      date: day,
      nav: roundTo(cash + equityValue, 2),
      cash,
      equityValue: roundTo(equityValue, 2),
      netFlow: roundTo(netFlow, 2),
      basis,
    });
  }
  return { rawPoints, sharesAtDate };
}

function emptyPerformance(accountId: string): PortfolioPerformanceResponse {
  return {
    accountId,
    status: "empty",
    totalNav: 0,
    cashBalance: 0,
    equityValue: 0,
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
  };
}

function resolveOverallBasis(series: readonly NavPoint[]): NavBasis {
  if (series.some((p) => p.basis === "cost_fallback")) return "cost_fallback";
  return series.some((p) => p.basis === "partial_bars") ? "partial_bars" : "full_bars";
}

function buildFinalNavPoints(
  rawPoints: readonly RawNavRow[],
  twrCum: ReadonlyArray<number | null>,
  spySeries: ReadonlyArray<number | null>,
  ddSeries: ReadonlyArray<number | null>,
): NavPoint[] {
  return rawPoints.map((p, i) => ({
    ...p,
    twrCumPct: twrCum[i] ?? null,
    spyTrCumPct: spySeries[i] ?? null,
    drawdownPct: ddSeries[i] ?? null,
  }));
}

/** Builds daily NAV, TWR, Modified Dietz, Max Drawdown, and SPY total-return comparison strictly from unadjusted closes (S1 / G16). */
export function buildPortfolioPerformanceSeries(
  input: PerformanceSeriesInput,
): PortfolioPerformanceResponse {
  if (input.transactions.length === 0) return emptyPerformance(input.accountId);
  const sortedTxs = [...input.transactions].sort(
    (a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.createdAtMs - b.createdAtMs,
  );
  const dates = collectDateGrid(input, sortedTxs[0]?.tradeDate ?? input.asOfDate);
  const { rawPoints, sharesAtDate } = simulateDailyNav(input, sortedTxs, dates);
  const twr = computeDailyTwr(rawPoints);
  const spySeries = rebaseTotalReturnPct(
    buildTotalReturnIndex(input.spyBars, input.spyDividends),
    dates,
  );
  const dd = computeMaxDrawdown(
    rawPoints.map((p, i) => ({ date: p.date, twrCumPct: twr.cumSeries[i] ?? null })),
  );
  const series = buildFinalNavPoints(rawPoints, twr.cumSeries, spySeries, dd.perDayDrawdownPct);
  const last = series[series.length - 1];
  const spyTrPct = last?.spyTrCumPct ?? null;
  const excess =
    twr.twrPct !== null && spyTrPct !== null ? roundTo(twr.twrPct - spyTrPct, 2) : null;
  return {
    accountId: input.accountId,
    status: twr.tradingDays > 0 || (last?.nav ?? 0) > 0 ? "ready" : "insufficient_bars",
    totalNav: last?.nav ?? 0,
    cashBalance: last?.cash ?? 0,
    equityValue: last?.equityValue ?? 0,
    twrPct: twr.twrPct,
    modifiedDietzPct: twr.modifiedDietzPct,
    annualizedTwrPct: twr.annualizedTwrPct,
    spyTrPct,
    excessReturnPct: excess,
    maxDrawdownPct: dd.maxDrawdownPct,
    maxDrawdownPeakDate: dd.peakDate,
    maxDrawdownTroughDate: dd.troughDate,
    currentDrawdownPct: dd.currentDrawdownPct,
    tradingDays: twr.tradingDays,
    basis: resolveOverallBasis(series),
    series,
    unrecordedDividends: detectUnrecordedDividends({
      transactions: sortedTxs,
      dividendsByTicker: input.dividendsByTicker,
      sharesAtDate,
    }),
  };
}
