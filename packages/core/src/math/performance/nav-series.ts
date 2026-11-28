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
import { type ReplayTxInput, type SplitActionInput, sortReplayTxs } from "./ledger-replay";
import { applyDayTxs, buildCloseLookup, type HoldingState, markEquityValue } from "./nav-helpers";
import { detectSplitRebaseCliffs, normalizeTransactionsToSplitBasis } from "./split-basis";
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
  normalizedTxs: readonly ReplayTxInput[],
  dates: readonly string[],
) {
  const txsByDay = new Map<string, ReplayTxInput[]>();
  for (const tx of normalizedTxs) {
    const arr = txsByDay.get(tx.tradeDate) ?? [];
    arr.push(tx);
    txsByDay.set(tx.tradeDate, arr);
  }
  const closeLookup = buildCloseLookup(input.barsByTicker);
  const holdings = new Map<string, HoldingState>();
  const lastClose = new Map<string, number>();
  const sharesAtDate = new Map<string, Map<string, number>>();
  let cash = 0;
  const rawPoints: RawNavRow[] = [];

  for (const day of dates) {
    const snap = new Map<string, number>();
    for (const [t, h] of holdings) if (h.shares > 1e-6) snap.set(t, h.shares);
    sharesAtDate.set(day, snap);
    const { cashDelta, netFlow } = applyDayTxs({
      dayTxs: txsByDay.get(day) ?? [],
      holdings,
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

function buildRebasePendingResponse(
  accountId: string,
  rawPoints: readonly RawNavRow[],
): PortfolioPerformanceResponse {
  const last = rawPoints[rawPoints.length - 1];
  return {
    accountId,
    status: "insufficient_bars",
    totalNav: last?.nav ?? 0,
    cashBalance: last?.cash ?? 0,
    equityValue: last?.equityValue ?? 0,
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
    basis: "rebase_pending",
    series: rawPoints.map((p) => ({
      ...p,
      twrCumPct: null,
      spyTrCumPct: null,
      drawdownPct: null,
    })),
    unrecordedDividends: [],
  };
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

/**
 * Builds daily NAV, TWR, Modified Dietz, Max Drawdown, and SPY total-return comparison on a unified
 * latest split-adjusted close-bar basis (never `.adjClose` — U0-5 / G16 / G23).
 */
export function buildPortfolioPerformanceSeries(
  input: PerformanceSeriesInput,
): PortfolioPerformanceResponse {
  if (input.transactions.length === 0) return emptyPerformance(input.accountId);
  const sortedTxs = sortReplayTxs(input.transactions);
  const normalizedTxs = normalizeTransactionsToSplitBasis(sortedTxs, input.splitsByTicker);
  const dates = collectDateGrid(input, sortedTxs[0]?.tradeDate ?? input.asOfDate);
  const { rawPoints, sharesAtDate } = simulateDailyNav(input, normalizedTxs, dates);
  if (hasHeldSplitCliff(sortedTxs, input))
    return buildRebasePendingResponse(input.accountId, rawPoints);

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
