import { roundTo } from "../valuation-scenarios";

export interface CloseBarPoint {
  barDate: string;
  close: number;
}

export interface CashDividendEvent {
  exDate: string;
  amount: number;
}

/**
 * Builds a dividend-reinvested Total Return Index strictly from unadjusted `close` + `corporate_actions` dividends
 * (NEVER `.adjClose` — enforced by G16) (S1).
 */
export function buildTotalReturnIndex(
  bars: readonly CloseBarPoint[],
  dividends: readonly CashDividendEvent[],
): Map<string, number> {
  const sorted = [...bars]
    .filter((b) => Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => a.barDate.localeCompare(b.barDate));
  const divByDate = new Map<string, number>();
  for (const d of dividends) {
    if (Number.isFinite(d.amount) && d.amount > 0) {
      divByDate.set(d.exDate, (divByDate.get(d.exDate) ?? 0) + d.amount);
    }
  }
  const index = new Map<string, number>();
  let tr = 1;
  let prevClose: number | null = null;
  for (const bar of sorted) {
    if (prevClose !== null && prevClose > 0) {
      const div = divByDate.get(bar.barDate) ?? 0;
      tr *= (bar.close + div) / prevClose;
    }
    index.set(bar.barDate, tr);
    prevClose = bar.close;
  }
  return index;
}

/** Computes cumulative percentage return of a total-return index rebased to `startDate`. */
export function rebaseTotalReturnPct(
  trIndex: ReadonlyMap<string, number>,
  dates: readonly string[],
): Array<number | null> {
  let base: number | null = null;
  let lastVal: number | null = null;
  return dates.map((d) => {
    const cur = trIndex.get(d) ?? lastVal;
    if (cur === null) return null;
    lastVal = cur;
    if (base === null) base = cur;
    return base > 0 ? roundTo(((cur - base) / base) * 100, 2) : null;
  });
}
