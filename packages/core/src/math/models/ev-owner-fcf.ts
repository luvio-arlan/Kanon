import { roundTo } from "../valuation-scenarios";

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

export function calculateTopDownEps(input: TopDownEpsInput): TopDownEpsResult | null {
  if (
    !Number.isFinite(input.currentRevenueB) ||
    input.currentRevenueB <= 0 ||
    !Number.isFinite(input.currentSharesM) ||
    input.currentSharesM <= 0 ||
    !Number.isFinite(input.revenueCagrPct) ||
    !Number.isFinite(input.targetNetMarginPct) ||
    !Number.isFinite(input.annualShareChangePct)
  ) {
    return null;
  }
  const years = Math.max(1, input.horizonYears);
  const revFactor = Math.max(0.01, 1 + input.revenueCagrPct / 100);
  const shareFactor = Math.max(0.01, 1 + input.annualShareChangePct / 100);
  const projectedRevenueB = roundTo(input.currentRevenueB * revFactor ** years, 2);
  const projectedNetIncomeB = roundTo(projectedRevenueB * (input.targetNetMarginPct / 100), 2);
  const projectedSharesM = roundTo(Math.max(0.01, input.currentSharesM * shareFactor ** years), 1);
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
  const equityValB = Math.max(0, fcfB * mult + netCashB);
  return roundTo((equityValB * 1000) / sharesM, 2);
}

function isValidEvOwnerFcfInput(input: EvOwnerFcfInput): boolean {
  return (
    Number.isFinite(input.currentPrice) &&
    input.currentPrice > 0 &&
    Number.isFinite(input.dilutedSharesM) &&
    input.dilutedSharesM > 0 &&
    Number.isFinite(input.baseOwnerFcfB) &&
    input.baseOwnerFcfB > 0 &&
    Number.isFinite(input.baseEvMultiple) &&
    input.baseEvMultiple > 0
  );
}

export function calculateEvOwnerFcfValuation(input: EvOwnerFcfInput): EvOwnerFcfResult | null {
  if (!isValidEvOwnerFcfInput(input)) return null;
  const price = input.currentPrice;
  const shares = input.dilutedSharesM;
  const years = Math.max(1, input.horizonYears);
  const netCashB = input.cashB - input.totalDebtB;
  const currentMarketCapB = roundTo((price * shares) / 1000, 2);
  const currentEvB = roundTo(currentMarketCapB - netCashB, 2);
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
  const baseCagrPct =
    baseTargetPrice <= 0 ? -100 : roundTo(((baseTargetPrice / price) ** (1 / years) - 1) * 100, 1);
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
