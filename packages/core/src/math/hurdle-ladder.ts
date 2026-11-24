import type { ValuationScenarioSummary } from "../schemas/thesis";
import { roundTo } from "./valuation-scenarios";

export interface HurdleRung {
  hurdlePct: number;
  entryPrice: number;
  gapFromCurrentPct: number;
  met: boolean;
}

export interface HurdleLadderReport {
  currentPrice: number;
  baseTargetPrice: number;
  horizonYears: number;
  impliedBaseIrrPct: number;
  expectedValueReturnPct: number;
  kellyBreakevenWinRatePct: number | null;
  rungs: HurdleRung[];
}

const DEFAULT_HURDLES = [10, 15, 20, 25] as const;

export function calculateHurdleLadder(
  summary: ValuationScenarioSummary,
  hurdles: readonly number[] = DEFAULT_HURDLES,
): HurdleLadderReport {
  const price = Math.max(0.01, summary.currentPrice);
  const target = Math.max(0.01, summary.base.targetPrice);
  const years = Math.max(1, summary.horizonYears);

  const rungs: HurdleRung[] = hurdles.map((hurdlePct) => {
    const entryPrice = roundTo(target / (1 + hurdlePct / 100) ** years, 2);
    const gapFromCurrentPct = roundTo(((entryPrice - price) / price) * 100, 1);
    return {
      hurdlePct,
      entryPrice,
      gapFromCurrentPct,
      met: price <= entryPrice,
    };
  });

  const rr = summary.riskRewardRatio;
  const kellyBreakevenWinRatePct =
    rr === null ? 0 : rr > 0 ? roundTo((1 / (1 + rr)) * 100, 1) : null;
  const expectedValueReturnPct = roundTo(((summary.expectedTargetPrice - price) / price) * 100, 1);

  return {
    currentPrice: price,
    baseTargetPrice: target,
    horizonYears: years,
    impliedBaseIrrPct: summary.base.cagrPct,
    expectedValueReturnPct,
    kellyBreakevenWinRatePct,
    rungs,
  };
}
