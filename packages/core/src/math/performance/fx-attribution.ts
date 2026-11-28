import type { NavBasis, PortfolioPerformanceResponse } from "../../contracts/analytics";
import { type CurrencyCode, CurrencyCodeSchema } from "../../contracts/intel/primitives";
import { roundTo } from "../valuation-scenarios";
import {
  buildTotalReturnIndex,
  type CashDividendEvent,
  type CloseBarPoint,
  rebaseTotalReturnPct,
} from "./benchmark-tr";
import { computeMaxDrawdown } from "./drawdown";
import { computeDailyTwr } from "./twr";

export interface DailyFxRatePoint {
  rateDate: string;
  usdPerUnit: number;
}

const MAX_FX_LOOKBACK_DAYS = 7;

function daysBetweenIso(earlier: string, later: string): number {
  return (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000;
}

function findLatestUsdPerUnit(
  currency: string,
  date: string,
  ratesByCurrency: ReadonlyMap<string, readonly DailyFxRatePoint[]>,
): number | null {
  const code = currency.trim().toUpperCase();
  if (code === "USD") return 1;
  const series = ratesByCurrency.get(code);
  if (!series || series.length === 0) return null;
  let best: DailyFxRatePoint | null = null;
  for (const pt of series) {
    if (pt.rateDate <= date) best = pt;
    else break;
  }
  if (!best || best.usdPerUnit <= 0) return null;
  if (daysBetweenIso(best.rateDate, date) > MAX_FX_LOOKBACK_DAYS) return null;
  return best.usdPerUnit;
}

/**
 * Resolves cross exchange rate `X_{from -> to}(date) = usdPerUnit(from) / usdPerUnit(to)`.
 * Returns `null` when either leg is missing within the 5-business-day (7-calendar-day) window.
 */
export function resolveCrossFxRateOnDate(
  fromCurrency: string,
  toCurrency: string,
  date: string,
  ratesByCurrency: ReadonlyMap<string, readonly DailyFxRatePoint[]>,
): number | null {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  if (from === to) return 1;
  const fromUsd = findLatestUsdPerUnit(from, date, ratesByCurrency);
  const toUsd = findLatestUsdPerUnit(to, date, ratesByCurrency);
  if (fromUsd === null || toUsd === null) return null;
  return fromUsd / toUsd;
}

/**
 * Converts a USD cumulative SPY total-return series (%) into account `baseCurrency`:
 * `1 + R_{SPY,B}(t) = (1 + R_{SPY,USD}(t)) * (X_{USD->B}(t) / X_{USD->B}(0))`.
 */
export function convertSpyTrSeriesToBase(params: {
  dates: readonly string[];
  spyUsdCumPct: ReadonlyArray<number | null>;
  baseCurrency: CurrencyCode;
  ratesByCurrency: ReadonlyMap<string, readonly DailyFxRatePoint[]>;
}): Array<number | null> {
  if (params.baseCurrency === "USD") return [...params.spyUsdCumPct];
  const firstIdx = params.spyUsdCumPct.findIndex((v) => v !== null);
  if (firstIdx < 0) return params.spyUsdCumPct.map(() => null);
  const startDate = params.dates[firstIdx] ?? "";
  const x0 = resolveCrossFxRateOnDate(
    "USD",
    params.baseCurrency,
    startDate,
    params.ratesByCurrency,
  );
  if (x0 === null || x0 <= 0) return params.spyUsdCumPct.map(() => null);
  return params.dates.map((d, i) => {
    const rUsd = params.spyUsdCumPct[i];
    if (rUsd === null || rUsd === undefined) return null;
    const xt = resolveCrossFxRateOnDate("USD", params.baseCurrency, d, params.ratesByCurrency);
    if (xt === null) return null;
    const total = (1 + rUsd / 100) * (xt / x0) - 1;
    return roundTo(total * 100, 2);
  });
}

export interface DailyPositionMark {
  ticker: string;
  shares: number;
  localPrice: number;
  fxToBase: number;
}

function decomposeSingleTickerMove(
  prev: DailyPositionMark | undefined,
  curr: DailyPositionMark | undefined,
  flowBase: number,
): { local: number; fx: number } {
  const prevMv = prev ? prev.shares * prev.localPrice * prev.fxToBase : 0;
  const currMv = curr ? curr.shares * curr.localPrice * curr.fxToBase : 0;
  const totalPnl = currMv - prevMv - flowBase;
  if (!prev || !curr) return { local: totalPnl, fx: 0 };
  // Only shares held across the whole day carry the X_{t-1} → X_t move; shares traded today were
  // booked at the trade-day rate, so their FX effect is zero by construction (V1-3).
  const heldShares = Math.min(prev.shares, curr.shares);
  const fx = heldShares * curr.localPrice * (curr.fxToBase - prev.fxToBase);
  return { local: totalPnl - fx, fx };
}

/**
 * Exact additive daily local-price + FX attribution with zero residual (U1-1):
 * `ΔMV_i = q_i * (P_t - P_{t-1}) * X_{t-1} + q_i * P_t * (X_t - X_{t-1})`
 */
export function accumulateDailyFxAttribution(params: {
  prevByTicker: ReadonlyMap<string, DailyPositionMark>;
  currByTicker: ReadonlyMap<string, DailyPositionMark>;
  dayTradeFlowBaseByTicker: ReadonlyMap<string, number>;
}): { localDelta: number; fxDelta: number } {
  let localDelta = 0;
  let fxDelta = 0;
  const tickers = new Set([...params.prevByTicker.keys(), ...params.currByTicker.keys()]);
  for (const ticker of tickers) {
    const part = decomposeSingleTickerMove(
      params.prevByTicker.get(ticker),
      params.currByTicker.get(ticker),
      params.dayTradeFlowBaseByTicker.get(ticker) ?? 0,
    );
    localDelta += part.local;
    fxDelta += part.fx;
  }
  return { localDelta, fxDelta };
}

export function computeBenchmarkAndSeries(params: {
  spyBars: readonly CloseBarPoint[];
  spyDividends: readonly CashDividendEvent[];
  fxRatesByCurrency?: ReadonlyMap<string, readonly DailyFxRatePoint[]>;
  baseCurrency: CurrencyCode;
  dates: readonly string[];
  rawPoints: ReadonlyArray<{
    date: string;
    nav: number;
    cash: number;
    equityValue: number;
    netFlow: number;
    basis: NavBasis;
  }>;
}) {
  const twr = computeDailyTwr(params.rawPoints);
  const spyUsd = rebaseTotalReturnPct(
    buildTotalReturnIndex(params.spyBars, params.spyDividends),
    params.dates,
  );
  const spySeries = convertSpyTrSeriesToBase({
    dates: params.dates,
    spyUsdCumPct: spyUsd,
    baseCurrency: params.baseCurrency,
    ratesByCurrency: params.fxRatesByCurrency ?? new Map(),
  });
  const dd = computeMaxDrawdown(
    params.rawPoints.map((row, i) => ({ date: row.date, twrCumPct: twr.cumSeries[i] ?? null })),
  );
  const series = params.rawPoints.map((p, i) => ({
    ...p,
    twrCumPct: twr.cumSeries[i] ?? null,
    spyTrCumPct: spySeries[i] ?? null,
    drawdownPct: dd.perDayDrawdownPct[i] ?? null,
  }));
  return { twr, dd, series };
}

type FxGap = PortfolioPerformanceResponse["fxGaps"][number];

function pushGap(gaps: FxGap[], currency: string, span: { from: string; to: string }) {
  const parsed = CurrencyCodeSchema.safeParse(currency);
  if (parsed.success) gaps.push({ currency: parsed.data, ...span });
}

type OpenGaps = Map<string, { from: string; to: string }>;

function closeResolvedGaps(open: OpenGaps, missing: ReadonlySet<string>, gaps: FxGap[]) {
  for (const [currency, span] of open) {
    if (missing.has(currency)) continue;
    pushGap(gaps, currency, span);
    open.delete(currency);
  }
}

function extendMissingGaps(open: OpenGaps, missing: ReadonlySet<string>, day: string) {
  for (const currency of missing) {
    const span = open.get(currency);
    if (span) span.to = day;
    else open.set(currency, { from: day, to: day });
  }
}

/** Compresses per-day missing-FX currencies into contiguous `[from, to]` spans on the NAV date grid. */
export function collectFxGaps(
  dates: readonly string[],
  fxMissingByDay: ReadonlyMap<string, ReadonlySet<string>>,
): FxGap[] {
  const gaps: FxGap[] = [];
  const open: OpenGaps = new Map();
  for (const day of dates) {
    const missing = fxMissingByDay.get(day) ?? new Set<string>();
    closeResolvedGaps(open, missing, gaps);
    extendMissingGaps(open, missing, day);
  }
  for (const [currency, span] of open) pushGap(gaps, currency, span);
  return gaps;
}
