import { roundTo } from "../valuation-scenarios";

export interface WaccInput {
  riskFreeRatePct: number;
  equityRiskPremiumPct: number;
  beta: number;
  countryRiskPremiumPct?: number;
  preTaxCostOfDebtPct: number;
  marginalTaxRatePct: number;
  marketCapB: number;
  totalDebtB: number;
  leaseDebtB?: number;
}

export interface WaccResult {
  costOfEquityPct: number;
  afterTaxCostOfDebtPct: number;
  equityWeightPct: number;
  debtWeightPct: number;
  waccPct: number;
}

/**
 * Damodaran-standard market-value-weighted WACC:
 * Ke = Rf + Beta * ERP + CRP; Kd_after_tax = Kd * (1 - marginalTaxRate).
 */
export function calculateWacc(input: WaccInput): WaccResult {
  const crp = input.countryRiskPremiumPct ?? 0;
  const costOfEquityPct = input.riskFreeRatePct + input.beta * input.equityRiskPremiumPct + crp;
  const taxRate = Math.max(0, Math.min(0.6, input.marginalTaxRatePct / 100));
  const afterTaxCostOfDebtPct = input.preTaxCostOfDebtPct * (1 - taxRate);

  const equityVal = Math.max(0, input.marketCapB);
  const debtVal = Math.max(0, input.totalDebtB) + Math.max(0, input.leaseDebtB ?? 0);
  const totalCapital = equityVal + debtVal;
  const equityWeight = totalCapital > 0 ? equityVal / totalCapital : 1;
  const debtWeight = 1 - equityWeight;
  const waccPct = equityWeight * costOfEquityPct + debtWeight * afterTaxCostOfDebtPct;

  return {
    costOfEquityPct: roundTo(costOfEquityPct, 2),
    afterTaxCostOfDebtPct: roundTo(afterTaxCostOfDebtPct, 2),
    equityWeightPct: roundTo(equityWeight * 100, 1),
    debtWeightPct: roundTo(debtWeight * 100, 1),
    waccPct: roundTo(waccPct, 2),
  };
}
