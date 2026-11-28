import { roundTo } from "../valuation-scenarios";
import { computeDayReturn, type DailyNavFlowPoint } from "./twr";

/**
 * Carino-linked split of chained TWR into FX and local contributions (V1-3).
 * Per day: `c_fx,t = ΔFX_t / (NAV_{t-1} + F_t⁺)`, `c_loc,t = r_t − c_fx,t` (prices, dividends, fees);
 * `k_t = ln(1+r_t)/r_t`, `K = ln(1+R)/R`, `C = Σ (k_t / K) · c_t`, so `C_loc + C_fx = TWR` exactly.
 */
export function linkFxContributionCarino(
  points: readonly DailyNavFlowPoint[],
  dailyFxBase: readonly number[],
): { localPct: number; fxPct: number } | null {
  let factor = 1;
  let active = 0;
  let sumLoc = 0;
  let sumFx = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const r = prev && curr ? computeDayReturn(prev, curr) : null;
    if (r === null || !prev || !curr) continue;
    const denom = prev.nav + Math.max(0, curr.netFlow);
    const cFx = (dailyFxBase[i] ?? 0) / denom;
    const k = Math.abs(r) < 1e-12 ? 1 : Math.log1p(r) / r;
    sumFx += k * cFx;
    sumLoc += k * (r - cFx);
    factor *= 1 + r;
    active += 1;
  }
  if (active === 0) return null;
  const total = factor - 1;
  const bigK = Math.abs(total) < 1e-12 ? 1 : Math.log1p(total) / total;
  return { localPct: roundTo((sumLoc / bigK) * 100, 2), fxPct: roundTo((sumFx / bigK) * 100, 2) };
}
