import { solveMauboussinImpliedCap } from "./dcf/reverse-dcf-cap";
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
  const safeShares = Math.max(0.01, input.currentSharesM);
  const revFactor = Math.max(0.01, 1 + input.revenueCagrPct / 100);
  const shareFactor = Math.max(0.01, 1 + input.annualShareChangePct / 100);
  const projectedRevenueB = roundTo(Math.max(0.01, input.currentRevenueB) * revFactor ** years, 2);
  const projectedNetIncomeB = roundTo(projectedRevenueB * (input.targetNetMarginPct / 100), 2);
  const projectedSharesM = roundTo(Math.max(0.01, safeShares * shareFactor ** years), 1);
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

export function calculateEvOwnerFcfValuation(input: EvOwnerFcfInput): EvOwnerFcfResult {
  const price = Math.max(0.01, input.currentPrice);
  const shares = Math.max(0.01, input.dilutedSharesM);
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

export interface ReverseDcfInput {
  currentPrice: number;
  baseMetricPerShare: number;
  horizonYears: number;
  hurdleRatePct: number;
  terminalMultiple: number;
  historicalCagrPct?: number | null;
  ronicPct?: number | null;
}

export interface ReverseDcfResult {
  requiredCagrPct: number;
  historicalCagrPct: number | null;
  expectationsGapPct: number | null;
  impliedTerminalPrice: number;
  impliedReinvestmentRatePct: number | null;
  impliedCapYears: number;
  verdict: "underpriced" | "fair" | "demanding";
}

function presentValueAtGrowth(
  baseMetric: number,
  growthRate: number,
  discountRate: number,
  years: number,
  terminalMultiple: number,
  ronicRate: number | null,
): number {
  const reinvest = ronicRate && growthRate > 0 ? Math.min(0.85, growthRate / ronicRate) : 0;
  let pv = 0;
  let flow = baseMetric;
  for (let y = 1; y <= years; y += 1) {
    flow *= 1 + growthRate;
    pv += (flow * (1 - reinvest)) / (1 + discountRate) ** y;
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

function solveImpliedGrowthRate(
  base: number,
  price: number,
  discount: number,
  years: number,
  terminalMult: number,
  ronicRate: number | null,
): number {
  const evalPv = (g: number) =>
    presentValueAtGrowth(base, g, discount, years, terminalMult, ronicRate);
  const minG = -0.4;
  const maxG = 1.5;
  const steps = 38;
  let low = minG;
  let high = maxG;
  let prevG = minG;
  let prevDiff = evalPv(minG) - price;
  for (let s = 1; s <= steps; s += 1) {
    const curG = minG + ((maxG - minG) * s) / steps;
    const curDiff = evalPv(curG) - price;
    if ((prevDiff <= 0 && curDiff >= 0) || (prevDiff >= 0 && curDiff <= 0)) {
      low = prevG;
      high = curG;
      break;
    }
    prevG = curG;
    prevDiff = curDiff;
  }
  const lowBelow = evalPv(low) < price;
  for (let i = 0; i < 48; i += 1) {
    const mid = (low + high) / 2;
    if (evalPv(mid) < price === lowBelow) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function calculateTrueReverseDcf(input: ReverseDcfInput): ReverseDcfResult {
  const price = Math.max(0.01, input.currentPrice);
  const base = Math.max(0.05, input.baseMetricPerShare);
  const years = Math.min(10, Math.max(2, Math.round(input.horizonYears)));
  const discount = Math.max(0.03, input.hurdleRatePct / 100);
  const terminalMult = Math.max(4, input.terminalMultiple);

  const ronicRate =
    typeof input.ronicPct === "number" && input.ronicPct >= 5 ? input.ronicPct / 100 : null;

  const requiredRate = solveImpliedGrowthRate(
    base,
    price,
    discount,
    years,
    terminalMult,
    ronicRate,
  );
  const requiredCagrPct = roundTo(requiredRate * 100, 1);
  const impliedTerminalPrice = roundTo(base * (1 + requiredRate) ** years * terminalMult, 1);
  const hist =
    typeof input.historicalCagrPct === "number" && Number.isFinite(input.historicalCagrPct)
      ? roundTo(input.historicalCagrPct, 1)
      : null;
  const expectationsGapPct = hist !== null ? roundTo(hist - requiredCagrPct, 1) : null;
  const impliedReinvestmentRatePct =
    ronicRate && requiredRate > 0
      ? roundTo(Math.min(85, (requiredRate / ronicRate) * 100), 1)
      : null;
  const capResult = solveMauboussinImpliedCap({
    currentValue: price,
    baseNopat: base,
    growthRatePct: Math.max(0.5, requiredCagrPct),
    ronicPct: ronicRate ? ronicRate * 100 : Math.max(input.hurdleRatePct + 8, 22),
    waccPct: input.hurdleRatePct,
  });
  const impliedCapYears = Math.max(1, Math.round(capResult.impliedCapYears));

  return {
    requiredCagrPct,
    historicalCagrPct: hist,
    expectationsGapPct,
    impliedTerminalPrice,
    impliedReinvestmentRatePct,
    impliedCapYears,
    verdict: classifyReverseDcfVerdict(requiredCagrPct, expectationsGapPct),
  };
}

export {
  calculateTsrDecomposition,
  type TsrDecompositionResult,
} from "./models/tsr-decomposition";
