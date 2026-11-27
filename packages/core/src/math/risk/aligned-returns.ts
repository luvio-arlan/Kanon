import type { CashDividendEvent, CloseBarPoint } from "../performance/benchmark-tr";

export interface AlignedReturnsResult {
  dates: string[];
  includedTickers: string[];
  missingTickers: string[];
  returnSeries: number[][];
  spyReturns: number[] | null;
}

function indexDividendsByDate(dividends: readonly CashDividendEvent[]): Map<string, number> {
  const divByDate = new Map<string, number>();
  for (const d of dividends) {
    if (Number.isFinite(d.amount) && d.amount > 0) {
      divByDate.set(d.exDate, (divByDate.get(d.exDate) ?? 0) + d.amount);
    }
  }
  return divByDate;
}

function buildTickerDailyReturnMap(
  bars: readonly CloseBarPoint[],
  dividends: readonly CashDividendEvent[],
): Map<string, number> {
  const sorted = [...bars]
    .filter((b) => Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => a.barDate.localeCompare(b.barDate));
  const divByDate = indexDividendsByDate(dividends);
  const retMap = new Map<string, number>();
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev || !curr) continue;
    const r = (curr.close + (divByDate.get(curr.barDate) ?? 0)) / prev.close - 1;
    if (Number.isFinite(r) && r > -0.95 && r < 5) retMap.set(curr.barDate, r);
  }
  return retMap;
}

function collectEligibleTickers(
  tickers: readonly string[],
  barsByTicker: ReadonlyMap<string, readonly CloseBarPoint[]>,
  dividendsByTicker: ReadonlyMap<string, readonly CashDividendEvent[]>,
  minDays: number,
) {
  const retMaps = new Map<string, Map<string, number>>();
  const includedTickers: string[] = [];
  const missingTickers: string[] = [];
  for (const raw of tickers) {
    const t = raw.trim().toUpperCase();
    const map = buildTickerDailyReturnMap(
      barsByTicker.get(t) ?? [],
      dividendsByTicker.get(t) ?? [],
    );
    if (map.size >= minDays) {
      includedTickers.push(t);
      retMaps.set(t, map);
    } else {
      missingTickers.push(t);
    }
  }
  return { retMaps, includedTickers, missingTickers };
}

/** Aligns total-return daily returns across holdings strictly using unadjusted `.close` + dividends (S2 / G16). */
export function buildAlignedDailyReturns(params: {
  tickers: readonly string[];
  barsByTicker: ReadonlyMap<string, readonly CloseBarPoint[]>;
  dividendsByTicker: ReadonlyMap<string, readonly CashDividendEvent[]>;
  spyBars?: readonly CloseBarPoint[];
  spyDividends?: readonly CashDividendEvent[];
  minDays?: number;
  maxDays?: number;
}): AlignedReturnsResult {
  const minDays = params.minDays ?? 60;
  const maxDays = params.maxDays ?? 252;
  const { retMaps, includedTickers, missingTickers } = collectEligibleTickers(
    params.tickers,
    params.barsByTicker,
    params.dividendsByTicker,
    minDays,
  );
  if (includedTickers.length === 0) {
    return { dates: [], includedTickers, missingTickers, returnSeries: [], spyReturns: null };
  }
  const firstMap = retMaps.get(includedTickers[0] ?? "") ?? new Map<string, number>();
  let commonDates = [...firstMap.keys()]
    .filter((d) => includedTickers.every((t) => retMaps.get(t)?.has(d)))
    .sort((a, b) => a.localeCompare(b));
  if (commonDates.length > maxDays) commonDates = commonDates.slice(commonDates.length - maxDays);
  if (commonDates.length < minDays) {
    return {
      dates: [],
      includedTickers: [],
      missingTickers: [...params.tickers],
      returnSeries: [],
      spyReturns: null,
    };
  }
  const returnSeries = includedTickers.map((t) =>
    commonDates.map((d) => retMaps.get(t)?.get(d) ?? 0),
  );
  const spyMap = params.spyBars?.length
    ? buildTickerDailyReturnMap(params.spyBars, params.spyDividends ?? [])
    : null;
  const spyReturns =
    spyMap && commonDates.every((d) => spyMap.has(d))
      ? commonDates.map((d) => spyMap.get(d) ?? 0)
      : null;
  return { dates: commonDates, includedTickers, missingTickers, returnSeries, spyReturns };
}
