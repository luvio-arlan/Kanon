import { roundTo } from "./valuation-scenarios";

export interface TopDownEpsInput {
  currentRevenueB: number;
  revenueCagrPct: number;
  targetNetMarginPct: number;
  currentSharesM: number;
  annualShareChangePct: number;
  horizonYears: number;
}

export interface TopDownEpsResult {
  projectedRevenueB: number;
  projectedNetIncomeB: number;
  projectedSharesM: number;
  impliedEps: number;
}

export function calculateTopDownEps(input: TopDownEpsInput): TopDownEpsResult {
  const years = Math.max(1, input.horizonYears);
  const safeShares = Math.max(1, input.currentSharesM);
  const projectedRevenueB = roundTo(
    Math.max(0.01, input.currentRevenueB) * (1 + input.revenueCagrPct / 100) ** years,
    2,
  );
  const projectedNetIncomeB = roundTo(projectedRevenueB * (input.targetNetMarginPct / 100), 2);
  const projectedSharesM = roundTo(
    Math.max(1, safeShares * (1 + input.annualShareChangePct / 100) ** years),
    1,
  );
  const impliedEps = roundTo((projectedNetIncomeB * 1000) / projectedSharesM, 2);
  return { projectedRevenueB, projectedNetIncomeB, projectedSharesM, impliedEps };
}

export interface EvOwnerFcfInput {
  currentPrice: number;
  dilutedSharesM: number;
  cashB: number;
  totalDebtB: number;
  bearOwnerFcfB: number;
  baseOwnerFcfB: number;
  bullOwnerFcfB: number;
  bearEvMultiple: number;
  baseEvMultiple: number;
  bullEvMultiple: number;
  horizonYears: number;
}

export interface EvOwnerFcfResult {
  currentMarketCapB: number;
  currentEvB: number;
  bearTargetPrice: number;
  baseTargetPrice: number;
  bullTargetPrice: number;
  baseUpsidePct: number;
  baseCagrPct: number;
  riskRewardRatio: number | null;
}

function evTargetPerShare(fcfB: number, mult: number, netCashB: number, sharesM: number): number {
  const equityValB = Math.max(0.1, fcfB * mult + netCashB);
  return roundTo((equityValB * 1000) / sharesM, 2);
}

export function calculateEvOwnerFcfValuation(input: EvOwnerFcfInput): EvOwnerFcfResult {
  const price = Math.max(0.01, input.currentPrice);
  const shares = Math.max(1, input.dilutedSharesM);
  const years = Math.max(1, input.horizonYears);
  const netCashB = input.cashB - input.totalDebtB;
  const currentMarketCapB = roundTo((price * shares) / 1000, 2);
  const currentEvB = roundTo(Math.max(0.1, currentMarketCapB - netCashB), 2);
  const bearTargetPrice = evTargetPerShare(
    input.bearOwnerFcfB,
    input.bearEvMultiple,
    netCashB,
    shares,
  );
  const baseTargetPrice = evTargetPerShare(
    input.baseOwnerFcfB,
    input.baseEvMultiple,
    netCashB,
    shares,
  );
  const bullTargetPrice = evTargetPerShare(
    input.bullOwnerFcfB,
    input.bullEvMultiple,
    netCashB,
    shares,
  );
  const baseUpsidePct = roundTo(((baseTargetPrice - price) / price) * 100, 1);
  const baseCagrPct = roundTo(((baseTargetPrice / price) ** (1 / years) - 1) * 100, 1);
  const riskRewardRatio =
    baseTargetPrice <= price
      ? 0
      : bearTargetPrice >= price
        ? null
        : roundTo((baseTargetPrice - price) / (price - bearTargetPrice), 2);

  return {
    currentMarketCapB,
    currentEvB,
    bearTargetPrice,
    baseTargetPrice,
    bullTargetPrice,
    baseUpsidePct,
    baseCagrPct,
    riskRewardRatio,
  };
}

export interface ReverseDcfInput {
  currentPrice: number;
  baseMetricPerShare: number;
  horizonYears: number;
  hurdleRatePct: number;
  terminalMultiple: number;
  historicalCagrPct?: number | null;
}

export interface ReverseDcfResult {
  requiredCagrPct: number;
  historicalCagrPct: number | null;
  expectationsGapPct: number | null;
  impliedTerminalPrice: number;
  verdict: "underpriced" | "fair" | "demanding";
}

function presentValueAtGrowth(
  baseMetric: number,
  growthRate: number,
  discountRate: number,
  years: number,
  terminalMultiple: number,
): number {
  let pv = 0;
  let flow = baseMetric;
  for (let y = 1; y <= years; y += 1) {
    flow *= 1 + growthRate;
    pv += flow / (1 + discountRate) ** y;
  }
  return pv + (flow * terminalMultiple) / (1 + discountRate) ** years;
}

function classifyReverseDcfVerdict(
  requiredCagrPct: number,
  expectationsGapPct: number | null,
): ReverseDcfResult["verdict"] {
  if (expectationsGapPct !== null) {
    if (expectationsGapPct >= 5) return "underpriced";
    return expectationsGapPct <= -5 ? "demanding" : "fair";
  }
  if (requiredCagrPct <= 12) return "underpriced";
  return requiredCagrPct >= 25 ? "demanding" : "fair";
}

export function calculateTrueReverseDcf(input: ReverseDcfInput): ReverseDcfResult {
  const price = Math.max(0.01, input.currentPrice);
  const base = Math.max(0.05, input.baseMetricPerShare);
  const years = Math.min(10, Math.max(2, Math.round(input.horizonYears)));
  const discount = Math.max(0.03, input.hurdleRatePct / 100);
  const terminalMult = Math.max(4, input.terminalMultiple);

  let low = -0.4;
  let high = 1.5;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    const pv = presentValueAtGrowth(base, mid, discount, years, terminalMult);
    if (pv < price) low = mid;
    else high = mid;
  }
  const requiredRate = (low + high) / 2;
  const requiredCagrPct = roundTo(requiredRate * 100, 1);
  const impliedTerminalPrice = roundTo(base * (1 + requiredRate) ** years * terminalMult, 1);
  const hist =
    typeof input.historicalCagrPct === "number" && Number.isFinite(input.historicalCagrPct)
      ? roundTo(input.historicalCagrPct, 1)
      : null;
  const expectationsGapPct = hist !== null ? roundTo(hist - requiredCagrPct, 1) : null;

  return {
    requiredCagrPct,
    historicalCagrPct: hist,
    expectationsGapPct,
    impliedTerminalPrice,
    verdict: classifyReverseDcfVerdict(requiredCagrPct, expectationsGapPct),
  };
}

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
  if (!validTrailing) {
    const priceCagr = roundTo(
      ((params.forwardEps * params.forwardPe) / price) ** (1 / years) - 1,
      4,
    );
    const total = roundTo(priceCagr * 100 + capitalReturnPct, 1);
    return {
      fundamentalGrowthPct: roundTo(priceCagr * 100, 1),
      multipleReRatePct: 0,
      capitalReturnPct,
      totalAnnualizedTsrPct: total,
    };
  }
  const currentPe = price / validTrailing;
  const epsCagr = (params.forwardEps / validTrailing) ** (1 / years) - 1;
  const peCagr = (params.forwardPe / currentPe) ** (1 / years) - 1;
  const fundamentalGrowthPct = roundTo(epsCagr * 100, 1);
  const multipleReRatePct = roundTo(peCagr * 100, 1);
  const totalAnnualizedTsrPct = roundTo(
    fundamentalGrowthPct + multipleReRatePct + capitalReturnPct,
    1,
  );
  return {
    fundamentalGrowthPct,
    multipleReRatePct,
    capitalReturnPct,
    totalAnnualizedTsrPct,
  };
}
