import { roundTo } from "../valuation-scenarios";

export interface DuPontInput {
  netIncome: number;
  pretaxIncome: number;
  ebit: number;
  revenue: number;
  averageAssets: number;
  averageEquity: number;
}

export interface DuPontResult {
  taxBurden: number;
  interestBurden: number;
  ebitMarginPct: number;
  assetTurnover: number;
  equityMultiplier: number;
  roePct: number;
}

/**
 * 5-factor DuPont ROE decomposition:
 * ROE = (NI/EBT) * (EBT/EBIT) * (EBIT/Rev) * (Rev/AvgAssets) * (AvgAssets/AvgEquity).
 */
export function calculateDuPontDecomposition(input: DuPontInput): DuPontResult {
  const taxBurden = input.pretaxIncome !== 0 ? input.netIncome / input.pretaxIncome : 0;
  const interestBurden = input.ebit !== 0 ? input.pretaxIncome / input.ebit : 0;
  const ebitMargin = input.revenue > 0 ? input.ebit / input.revenue : 0;
  const assetTurnover = input.averageAssets > 0 ? input.revenue / input.averageAssets : 0;
  const equityMultiplier = input.averageEquity > 0 ? input.averageAssets / input.averageEquity : 0;
  const roe = taxBurden * interestBurden * ebitMargin * assetTurnover * equityMultiplier;

  return {
    taxBurden: roundTo(taxBurden, 3),
    interestBurden: roundTo(interestBurden, 3),
    ebitMarginPct: roundTo(ebitMargin * 100, 2),
    assetTurnover: roundTo(assetTurnover, 3),
    equityMultiplier: roundTo(equityMultiplier, 3),
    roePct: roundTo(roe * 100, 2),
  };
}
