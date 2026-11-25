import type { SotpSegment } from "../../schemas/v7-research-os";
import { roundTo } from "../valuation-scenarios";

export interface SotpValuationInput {
  segments: readonly SotpSegment[];
  netCashB: number;
  dilutedSharesM: number;
  holdingDiscountPct?: number;
  currentPrice: number;
  horizonYears: number;
}

export interface SotpSegmentBreakdown {
  id: string;
  name: string;
  metricLabel: string;
  bearValueB: number;
  baseValueB: number;
  bullValueB: number;
  baseSharePct: number;
}

export interface SotpValuationResult {
  segments: SotpSegmentBreakdown[];
  bearEnterpriseB: number;
  baseEnterpriseB: number;
  bullEnterpriseB: number;
  bearEquityB: number;
  baseEquityB: number;
  bullEquityB: number;
  bearTargetPrice: number;
  baseTargetPrice: number;
  bullTargetPrice: number;
  baseUpsidePct: number;
  baseCagrPct: number;
  riskRewardRatio: number | null;
}

function toTargetPrice(equityB: number, sharesM: number): number {
  return roundTo((Math.max(0, equityB) * 1000) / sharesM, 2);
}

function aggregateSegments(segments: readonly SotpSegment[]) {
  let bearEv = 0;
  let baseEv = 0;
  let bullEv = 0;
  const raw = segments.map((seg) => {
    const bv = seg.metricValueB * seg.bearMultiple;
    const mv = seg.metricValueB * seg.baseMultiple;
    const hv = seg.metricValueB * seg.bullMultiple;
    bearEv += bv;
    baseEv += mv;
    bullEv += hv;
    return { id: seg.id, name: seg.name, metricLabel: seg.metricLabel, bv, mv, hv };
  });
  const breakdown: SotpSegmentBreakdown[] = raw.map((item) => ({
    id: item.id,
    name: item.name,
    metricLabel: item.metricLabel,
    bearValueB: roundTo(item.bv, 2),
    baseValueB: roundTo(item.mv, 2),
    bullValueB: roundTo(item.hv, 2),
    baseSharePct: baseEv > 0 ? roundTo((item.mv / baseEv) * 100, 1) : 0,
  }));
  return { bearEv, baseEv, bullEv, breakdown };
}

export function calculateSotpValuation(input: SotpValuationInput): SotpValuationResult {
  const shares = Math.max(0.01, input.dilutedSharesM);
  const price = Math.max(0.01, input.currentPrice);
  const years = Math.max(1, input.horizonYears);
  const disc = 1 - Math.min(40, Math.max(0, input.holdingDiscountPct ?? 0)) / 100;
  const { bearEv, baseEv, bullEv, breakdown } = aggregateSegments(input.segments);

  const applyHoldcoDisc = (rawEquity: number) => (rawEquity > 0 ? rawEquity * disc : rawEquity);
  const bearEquityB = roundTo(applyHoldcoDisc(bearEv + input.netCashB), 2);
  const baseEquityB = roundTo(applyHoldcoDisc(baseEv + input.netCashB), 2);
  const bullEquityB = roundTo(applyHoldcoDisc(bullEv + input.netCashB), 2);
  const bearTargetPrice = toTargetPrice(bearEquityB, shares);
  const baseTargetPrice = toTargetPrice(baseEquityB, shares);
  const bullTargetPrice = toTargetPrice(bullEquityB, shares);
  const riskRewardRatio =
    baseTargetPrice <= price
      ? 0
      : bearTargetPrice >= price
        ? null
        : roundTo((baseTargetPrice - price) / (price - bearTargetPrice), 2);
  const baseCagrPct =
    baseTargetPrice <= 0 ? -100 : roundTo(((baseTargetPrice / price) ** (1 / years) - 1) * 100, 1);

  return {
    segments: breakdown,
    bearEnterpriseB: roundTo(bearEv, 2),
    baseEnterpriseB: roundTo(baseEv, 2),
    bullEnterpriseB: roundTo(bullEv, 2),
    bearEquityB,
    baseEquityB,
    bullEquityB,
    bearTargetPrice,
    baseTargetPrice,
    bullTargetPrice,
    baseUpsidePct: roundTo(((baseTargetPrice - price) / price) * 100, 1),
    baseCagrPct,
    riskRewardRatio,
  };
}
