import { roundTo } from "../valuation-scenarios";

export interface DrawdownSummary {
  maxDrawdownPct: number | null;
  peakDate: string | null;
  troughDate: string | null;
  currentDrawdownPct: number | null;
  perDayDrawdownPct: Array<number | null>;
}

/** Computes Max Drawdown strictly on the flow-neutral TWR wealth index (S1). */
export function computeMaxDrawdown(
  points: readonly { date: string; twrCumPct: number | null }[],
): DrawdownSummary {
  if (points.length === 0) {
    return {
      maxDrawdownPct: null,
      peakDate: null,
      troughDate: null,
      currentDrawdownPct: null,
      perDayDrawdownPct: [],
    };
  }
  let peakVal = 1;
  let peakDate = points[0]?.date ?? null;
  let maxDd = 0;
  let bestPeakDate: string | null = null;
  let bestTroughDate: string | null = null;
  let currentDd = 0;
  const perDayDrawdownPct: Array<number | null> = [];

  for (const pt of points) {
    if (pt.twrCumPct === null) {
      perDayDrawdownPct.push(null);
      continue;
    }
    const wealth = 1 + pt.twrCumPct / 100;
    if (wealth >= peakVal) {
      peakVal = wealth;
      peakDate = pt.date;
    }
    const dd = peakVal > 0 ? ((wealth - peakVal) / peakVal) * 100 : 0;
    currentDd = roundTo(dd, 2);
    perDayDrawdownPct.push(currentDd);
    if (dd < maxDd) {
      maxDd = dd;
      bestPeakDate = peakDate;
      bestTroughDate = pt.date;
    }
  }
  return {
    maxDrawdownPct: roundTo(maxDd, 2),
    peakDate: bestPeakDate,
    troughDate: bestTroughDate,
    currentDrawdownPct: currentDd,
    perDayDrawdownPct,
  };
}
