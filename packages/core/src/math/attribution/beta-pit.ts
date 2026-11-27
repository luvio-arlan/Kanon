import type { CashDividendEvent, CloseBarPoint } from "../performance/benchmark-tr";
import { roundTo } from "../valuation-scenarios";

function indexPreEntryDividends(
  dividends: readonly CashDividendEvent[],
  openDate: string,
): Map<string, number> {
  const divMap = new Map<string, number>();
  for (const d of dividends) {
    if (d.exDate < openDate && Number.isFinite(d.amount) && d.amount > 0) {
      divMap.set(d.exDate, (divMap.get(d.exDate) ?? 0) + d.amount);
    }
  }
  return divMap;
}

function buildPreEntryReturnMap(
  bars: readonly CloseBarPoint[],
  dividends: readonly CashDividendEvent[],
  openDate: string,
): Map<string, number> {
  const sorted = [...bars]
    .filter((b) => b.barDate < openDate && Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => a.barDate.localeCompare(b.barDate));
  const divMap = indexPreEntryDividends(dividends, openDate);
  const ret = new Map<string, number>();
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev || !curr) continue;
    const r = (curr.close + (divMap.get(curr.barDate) ?? 0)) / prev.close - 1;
    if (Number.isFinite(r) && r > -0.95 && r < 5) ret.set(curr.barDate, r);
  }
  return ret;
}

/**
 * Point-in-time OLS Beta vs SPY strictly using bars with `barDate < openDate` (zero look-ahead) (S3 / G16).
 */
export function computePitBeta(params: {
  assetBars: readonly CloseBarPoint[];
  assetDividends: readonly CashDividendEvent[];
  spyBars: readonly CloseBarPoint[];
  spyDividends: readonly CashDividendEvent[];
  openDate: string;
  lookbackDays?: number;
  minDays?: number;
}): number | null {
  const minDays = params.minDays ?? 60;
  const lookbackDays = params.lookbackDays ?? 252;
  const aMap = buildPreEntryReturnMap(params.assetBars, params.assetDividends, params.openDate);
  const sMap = buildPreEntryReturnMap(params.spyBars, params.spyDividends, params.openDate);
  let common = [...aMap.keys()].filter((d) => sMap.has(d)).sort((a, b) => a.localeCompare(b));
  if (common.length > lookbackDays) common = common.slice(common.length - lookbackDays);
  if (common.length < minDays) return null;

  let ma = 0;
  let ms = 0;
  for (const d of common) {
    ma += aMap.get(d) ?? 0;
    ms += sMap.get(d) ?? 0;
  }
  ma /= common.length;
  ms /= common.length;

  let cov = 0;
  let varS = 0;
  for (const d of common) {
    const da = (aMap.get(d) ?? 0) - ma;
    const ds = (sMap.get(d) ?? 0) - ms;
    cov += da * ds;
    varS += ds * ds;
  }
  return varS > 1e-12 ? roundTo(cov / varS, 2) : null;
}
