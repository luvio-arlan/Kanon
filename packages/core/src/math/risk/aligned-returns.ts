import type { CashDividendEvent, CloseBarPoint } from "../performance/benchmark-tr";

export interface AlignedReturnsResult {
  dates: string[];
  includedTickers: string[];
  missingTickers: string[];
  returnSeries: number[][];
  spyReturns: number[] | null;
  extremeReturnDays: number;
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
): { retMap: Map<string, number>; extremeDays: number } {
  const sorted = [...bars]
    .filter((b) => Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => a.barDate.localeCompare(b.barDate));
  const divByDate = indexDividendsByDate(dividends);
  const retMap = new Map<string, number>();
  let extremeDays = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev || !curr) continue;
    const r = (curr.close + (divByDate.get(curr.barDate) ?? 0)) / prev.close - 1;
    if (!Number.isFinite(r) || r <= -1) continue;
    if (r <= -0.95 || r >= 5) extremeDays += 1;
    retMap.set(curr.barDate, r);
  }
  return { retMap, extremeDays };
}

function intersectDates(
  tickers: readonly string[],
  retMaps: ReadonlyMap<string, ReadonlyMap<string, number>>,
): string[] {
  const first = tickers[0] ? retMaps.get(tickers[0]) : null;
  if (!first) return [];
  return [...first.keys()]
    .filter((d) => tickers.every((t) => retMaps.get(t)?.has(d)))
    .sort((a, b) => a.localeCompare(b));
}

function latestDateOf(retMap: ReadonlyMap<string, number> | undefined): string {
  let latest = "";
  if (!retMap) return latest;
  for (const d of retMap.keys()) if (d > latest) latest = d;
  return latest;
}

function chooseTickerToDrop(
  kept: readonly string[],
  retMaps: ReadonlyMap<string, ReadonlyMap<string, number>>,
): number {
  let bestDropIdx = 0;
  let bestOverlap = -1;
  let bestLatest = "";
  for (let i = 0; i < kept.length; i += 1) {
    const candidate = kept.filter((_, idx) => idx !== i);
    const overlapDates = intersectDates(candidate, retMaps);
    const overlap = overlapDates.length;
    const candLatest =
      overlapDates[overlapDates.length - 1] ?? latestDateOf(retMaps.get(candidate[0] ?? ""));
    if (overlap > bestOverlap || (overlap === bestOverlap && candLatest > bestLatest)) {
      bestOverlap = overlap;
      bestLatest = candLatest;
      bestDropIdx = i;
    }
  }
  return bestDropIdx;
}

/** Greedily drops the single sparsest (or stalest on tie) ticker until the remaining intersection reaches `minDays` (P2-4). */
function pruneSparseTickers(
  initial: readonly string[],
  retMaps: ReadonlyMap<string, ReadonlyMap<string, number>>,
  minDays: number,
): { kept: string[]; dropped: string[]; dates: string[] } {
  const kept = [...initial];
  const dropped: string[] = [];
  while (kept.length > 0) {
    const dates = intersectDates(kept, retMaps);
    if (dates.length >= minDays) return { kept, dropped, dates };
    if (kept.length === 1) {
      dropped.push(...kept);
      return { kept: [], dropped, dates: [] };
    }
    const removed = kept.splice(chooseTickerToDrop(kept, retMaps), 1)[0];
    if (removed) dropped.push(removed);
  }
  return { kept: [], dropped, dates: [] };
}

function collectEligibleTickers(params: {
  tickers: readonly string[];
  barsByTicker: ReadonlyMap<string, readonly CloseBarPoint[]>;
  dividendsByTicker: ReadonlyMap<string, readonly CashDividendEvent[]>;
  minDays: number;
}) {
  const retMaps = new Map<string, Map<string, number>>();
  const eligible: string[] = [];
  const missingTickers: string[] = [];
  let extremeReturnDays = 0;
  for (const raw of params.tickers) {
    const t = raw.trim().toUpperCase();
    const { retMap, extremeDays } = buildTickerDailyReturnMap(
      params.barsByTicker.get(t) ?? [],
      params.dividendsByTicker.get(t) ?? [],
    );
    extremeReturnDays += extremeDays;
    if (retMap.size >= params.minDays) {
      eligible.push(t);
      retMaps.set(t, retMap);
    } else {
      missingTickers.push(t);
    }
  }
  return { retMaps, eligible, missingTickers, extremeReturnDays };
}

/**
 * Aligns total-return daily returns across holdings using split-basis `.close` + dividends (S2 / G16 / P2-4).
 * Retains extreme tail returns (never silently drops them) and prunes sparse tickers instead of failing the whole portfolio.
 */
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
  const { retMaps, eligible, missingTickers, extremeReturnDays } = collectEligibleTickers({
    tickers: params.tickers,
    barsByTicker: params.barsByTicker,
    dividendsByTicker: params.dividendsByTicker,
    minDays,
  });
  const { kept, dropped, dates: rawDates } = pruneSparseTickers(eligible, retMaps, minDays);
  missingTickers.push(...dropped);
  if (kept.length === 0) {
    return {
      dates: [],
      includedTickers: [],
      missingTickers,
      returnSeries: [],
      spyReturns: null,
      extremeReturnDays,
    };
  }
  const commonDates =
    rawDates.length > maxDays ? rawDates.slice(rawDates.length - maxDays) : rawDates;
  const returnSeries = kept.map((t) => commonDates.map((d) => retMaps.get(t)?.get(d) ?? 0));
  const spyMap = params.spyBars?.length
    ? buildTickerDailyReturnMap(params.spyBars, params.spyDividends ?? []).retMap
    : null;
  const spyReturns =
    spyMap && commonDates.every((d) => spyMap.has(d))
      ? commonDates.map((d) => spyMap.get(d) ?? 0)
      : null;
  return {
    dates: commonDates,
    includedTickers: kept,
    missingTickers,
    returnSeries,
    spyReturns,
    extremeReturnDays,
  };
}
