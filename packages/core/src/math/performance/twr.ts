import { roundTo } from "../valuation-scenarios";

export interface DailyNavFlowPoint {
  date: string;
  nav: number;
  netFlow: number;
}

export interface TwrResult {
  twrPct: number | null;
  annualizedTwrPct: number | null;
  modifiedDietzPct: number | null;
  cumSeries: Array<number | null>;
  tradingDays: number;
}

function computeModifiedDietzPct(points: readonly DailyNavFlowPoint[]): number | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) return null;
  const startMs = Date.parse(`${first.date}T00:00:00Z`);
  const endMs = Date.parse(`${last.date}T00:00:00Z`);
  const totalDays = Math.max(1, (endMs - startMs) / 86_400_000);
  const v0 = first.nav;
  let sumFlows = 0;
  let weightedFlows = 0;
  for (let i = 1; i < points.length; i += 1) {
    const pt = points[i];
    if (!pt || Math.abs(pt.netFlow) <= 1e-9) continue;
    const elapsed = Math.max(0, (Date.parse(`${pt.date}T00:00:00Z`) - startMs) / 86_400_000);
    const w = Math.max(0, Math.min(1, (totalDays - elapsed) / totalDays));
    sumFlows += pt.netFlow;
    weightedFlows += w * pt.netFlow;
  }
  const denom = v0 + weightedFlows;
  if (denom <= 0.01) return null;
  return roundTo(((last.nav - v0 - sumFlows) / denom) * 100, 2);
}

/** Daily TWR sub-period return with same-day inflows at start of day; shared by FX contribution linking. */
export function computeDayReturn(prev: DailyNavFlowPoint, curr: DailyNavFlowPoint): number | null {
  const denom = prev.nav + Math.max(0, curr.netFlow);
  if (denom <= 0.01) return null;
  const dayRet = (curr.nav - prev.nav - curr.netFlow) / denom;
  return Number.isFinite(dayRet) && dayRet > -1 ? dayRet : null;
}

/** Computes daily chained Time-Weighted Return (TWR) and Modified Dietz return (S1). */
export function computeDailyTwr(points: readonly DailyNavFlowPoint[]): TwrResult {
  if (points.length === 0) {
    return {
      twrPct: null,
      annualizedTwrPct: null,
      modifiedDietzPct: null,
      cumSeries: [],
      tradingDays: 0,
    };
  }
  let factor = 1;
  let activeDays = 0;
  const cumSeries: Array<number | null> = [0];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const dayRet = prev && curr ? computeDayReturn(prev, curr) : null;
    if (dayRet !== null) {
      factor *= 1 + dayRet;
      activeDays += 1;
    }
    cumSeries.push(roundTo((factor - 1) * 100, 2));
  }
  const twrPct = activeDays > 0 ? roundTo((factor - 1) * 100, 2) : null;
  const annualizedTwrPct =
    activeDays >= 252 && factor > 0 ? roundTo((factor ** (252 / activeDays) - 1) * 100, 2) : null;
  return {
    twrPct,
    annualizedTwrPct,
    modifiedDietzPct: computeModifiedDietzPct(points),
    cumSeries,
    tradingDays: activeDays,
  };
}
