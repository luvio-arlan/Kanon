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
  bearValueB: number | null;
  baseValueB: number | null;
  bullValueB: number | null;
  baseSharePct: number | null;
}

export interface SotpValuationResult {
  segments: SotpSegmentBreakdown[];
  bearEnterpriseB: number | null;
  baseEnterpriseB: number | null;
  bullEnterpriseB: number | null;
  bearEquityB: number | null;
  baseEquityB: number | null;
  bullEquityB: number | null;
  bearTargetPrice: number | null;
  baseTargetPrice: number | null;
  bullTargetPrice: number | null;
  baseUpsidePct: number | null;
  baseCagrPct: number | null;
  riskRewardRatio: number | null;
}

function toTargetPrice(equityB: number, sharesM: number): number {
  return roundTo((Math.max(0, equityB) * 1000) / sharesM, 2);
}

function isSegmentComplete(seg: SotpSegment): seg is SotpSegment & {
  metricValueB: number;
  bearMultiple: number;
  baseMultiple: number;
  bullMultiple: number;
} {
  return (
    seg.metricValueB !== null &&
    seg.bearMultiple !== null &&
    seg.baseMultiple !== null &&
    seg.bullMultiple !== null &&
    Number.isFinite(seg.metricValueB) &&
    Number.isFinite(seg.bearMultiple) &&
    Number.isFinite(seg.baseMultiple) &&
    Number.isFinite(seg.bullMultiple)
  );
}

function aggregateSegments(segments: readonly SotpSegment[]) {
  let bearEv = 0;
  let baseEv = 0;
  let bullEv = 0;
  let allComplete = segments.length > 0;
  const raw = segments.map((seg) => {
    if (!isSegmentComplete(seg)) {
      allComplete = false;
      return {
        id: seg.id,
        name: seg.name,
        metricLabel: seg.metricLabel,
        bv: null,
        mv: null,
        hv: null,
      };
    }
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
    bearValueB: item.bv !== null ? roundTo(item.bv, 2) : null,
    baseValueB: item.mv !== null ? roundTo(item.mv, 2) : null,
    bullValueB: item.hv !== null ? roundTo(item.hv, 2) : null,
    baseSharePct: item.mv !== null && baseEv > 0 ? roundTo((item.mv / baseEv) * 100, 1) : null,
  }));
  return { allComplete, bearEv, baseEv, bullEv, breakdown };
}

function emptySotpResult(segments: SotpSegmentBreakdown[]): SotpValuationResult {
  return {
    segments,
    bearEnterpriseB: null,
    baseEnterpriseB: null,
    bullEnterpriseB: null,
    bearEquityB: null,
    baseEquityB: null,
    bullEquityB: null,
    bearTargetPrice: null,
    baseTargetPrice: null,
    bullTargetPrice: null,
    baseUpsidePct: null,
    baseCagrPct: null,
    riskRewardRatio: null,
  };
}

function computeSotpReturnMetrics(
  currentPrice: number,
  horizonYears: number,
  bearTargetPrice: number,
  baseTargetPrice: number,
) {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { baseUpsidePct: null, baseCagrPct: null, riskRewardRatio: null };
  }
  const years = Math.max(1, horizonYears);
  const riskRewardRatio =
    baseTargetPrice <= currentPrice
      ? 0
      : bearTargetPrice >= currentPrice
        ? null
        : roundTo((baseTargetPrice - currentPrice) / (currentPrice - bearTargetPrice), 2);
  const baseCagrPct =
    baseTargetPrice <= 0
      ? -100
      : roundTo(((baseTargetPrice / currentPrice) ** (1 / years) - 1) * 100, 1);
  return {
    baseUpsidePct: roundTo(((baseTargetPrice - currentPrice) / currentPrice) * 100, 1),
    baseCagrPct,
    riskRewardRatio,
  };
}

export function calculateSotpValuation(input: SotpValuationInput): SotpValuationResult {
  const { allComplete, bearEv, baseEv, bullEv, breakdown } = aggregateSegments(input.segments);
  if (!allComplete || !Number.isFinite(input.dilutedSharesM) || input.dilutedSharesM <= 0) {
    return emptySotpResult(breakdown);
  }
  const disc = 1 - Math.min(40, Math.max(0, input.holdingDiscountPct ?? 0)) / 100;
  const applyHoldcoDisc = (rawEquity: number) => (rawEquity > 0 ? rawEquity * disc : rawEquity);
  const bearEquityB = roundTo(applyHoldcoDisc(bearEv + input.netCashB), 2);
  const baseEquityB = roundTo(applyHoldcoDisc(baseEv + input.netCashB), 2);
  const bullEquityB = roundTo(applyHoldcoDisc(bullEv + input.netCashB), 2);
  const bearTargetPrice = toTargetPrice(bearEquityB, input.dilutedSharesM);
  const baseTargetPrice = toTargetPrice(baseEquityB, input.dilutedSharesM);
  const bullTargetPrice = toTargetPrice(bullEquityB, input.dilutedSharesM);
  const metrics = computeSotpReturnMetrics(
    input.currentPrice,
    input.horizonYears,
    bearTargetPrice,
    baseTargetPrice,
  );
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
    ...metrics,
  };
}
