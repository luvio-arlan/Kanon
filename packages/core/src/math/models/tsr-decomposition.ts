import { roundTo } from "../valuation-scenarios";

export interface TsrDecompositionResult {
  fundamentalGrowthPct: number;
  multipleReRatePct: number;
  capitalReturnPct: number;
  totalAnnualizedTsrPct: number;
}

export function calculateTsrDecomposition(params: {
  currentPrice: number;
  trailingEps: number | null;
  forwardEps: number;
  forwardPe: number;
  horizonYears: number;
  annualCapitalReturnPct?: number;
}): TsrDecompositionResult {
  const years = Math.max(1, params.horizonYears);
  const price = Math.max(0.01, params.currentPrice);
  const capitalReturnPct = roundTo(params.annualCapitalReturnPct ?? 0, 1);
  const validTrailing =
    typeof params.trailingEps === "number" && params.trailingEps > 0 ? params.trailingEps : null;
  const safeForwardEps = Math.max(0.01, params.forwardEps);
  const safeForwardPe = Math.max(0.1, params.forwardPe);
  if (!validTrailing) {
    const priceCagr = roundTo(((safeForwardEps * safeForwardPe) / price) ** (1 / years) - 1, 4);
    const total = roundTo(priceCagr * 100 + capitalReturnPct, 1);
    return {
      fundamentalGrowthPct: roundTo(priceCagr * 100, 1),
      multipleReRatePct: 0,
      capitalReturnPct,
      totalAnnualizedTsrPct: total,
    };
  }
  const currentPe = price / validTrailing;
  const epsCagr = (safeForwardEps / validTrailing) ** (1 / years) - 1;
  const peCagr = (safeForwardPe / currentPe) ** (1 / years) - 1;
  const fundamentalGrowthPct = roundTo(epsCagr * 100, 1);
  const multipleReRatePct = roundTo(peCagr * 100, 1);
  const compoundedPricePct = ((1 + epsCagr) * (1 + peCagr) - 1) * 100;
  const totalAnnualizedTsrPct = roundTo(compoundedPricePct + capitalReturnPct, 1);
  return {
    fundamentalGrowthPct,
    multipleReRatePct,
    capitalReturnPct,
    totalAnnualizedTsrPct,
  };
}
