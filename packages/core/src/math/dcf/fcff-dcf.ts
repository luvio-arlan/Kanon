import { roundTo } from "../valuation-scenarios";
import { calculateEquityBridge, type OptionTranche } from "./equity-bridge";

export interface MultiStageFcffInput {
  baseRevenueB: number;
  highGrowthYears: number;
  fadeYears: number;
  initialRevenueGrowthPct: number;
  terminalGrowthPct: number;
  initialEbitMarginPct: number;
  terminalEbitMarginPct: number;
  effectiveTaxRatePct: number;
  salesToCapitalRatio: number;
  terminalRonicPct: number;
  waccPct: number;
  midYearConvention?: boolean;
  cashAndStInvestmentsB: number;
  totalDebtB: number;
  operatingLeaseLiabilitiesB?: number;
  preferredStockB?: number;
  minorityInterestB?: number;
  nonOperatingAssetsB?: number;
  basicSharesM: number;
  optionGrants?: readonly OptionTranche[];
  rsuSharesM?: number;
  assumedSharePrice: number;
}

export interface FcffProjectionYear {
  year: number;
  stage: "high_growth" | "fade";
  revenueGrowthPct: number;
  ebitMarginPct: number;
  revenueB: number;
  nopatB: number;
  reinvestmentB: number;
  fcffB: number;
  discountFactor: number;
  pvFcffB: number;
}

export interface MultiStageFcffResult {
  schedule: FcffProjectionYear[];
  pvExplicitFcffB: number;
  terminalNopatB: number;
  terminalReinvestmentRatePct: number;
  terminalValueB: number;
  pvTerminalValueB: number;
  terminalValueSharePct: number;
  enterpriseValueB: number;
  equityValueB: number;
  dilutedSharesM: number;
  fairValuePerShare: number;
}

function projectExplicitFcffSchedule(
  input: MultiStageFcffInput,
  wacc: number,
  taxRate: number,
): { schedule: FcffProjectionYear[]; pvExplicitFcffB: number; lastRevB: number } {
  const highYears = Math.max(1, Math.min(10, Math.round(input.highGrowthYears)));
  const fadeYears = Math.max(0, Math.min(10, Math.round(input.fadeYears)));
  const totalYears = highYears + fadeYears;
  const salesToCap = Math.max(0.25, input.salesToCapitalRatio);
  const midOffset = input.midYearConvention === false ? 0 : 0.5;

  const schedule: FcffProjectionYear[] = [];
  let rev = Math.max(0.01, input.baseRevenueB);
  let pvSum = 0;

  for (let y = 1; y <= totalYears; y += 1) {
    const isFade = y > highYears;
    const fadeProgress = isFade && fadeYears > 0 ? (y - highYears) / fadeYears : 0;
    const growthPct = isFade
      ? input.initialRevenueGrowthPct +
        (input.terminalGrowthPct - input.initialRevenueGrowthPct) * fadeProgress
      : input.initialRevenueGrowthPct;
    const marginPct =
      input.initialEbitMarginPct +
      (input.terminalEbitMarginPct - input.initialEbitMarginPct) * (y / totalYears);

    const prevRev = rev;
    rev = prevRev * (1 + growthPct / 100);
    const nopat = rev * (marginPct / 100) * (1 - taxRate);
    const reinvestment = Math.max(0, (rev - prevRev) / salesToCap);
    const fcff = nopat - reinvestment;
    const df = 1 / (1 + wacc) ** (y - midOffset);
    const pv = fcff * df;
    pvSum += pv;

    schedule.push({
      year: y,
      stage: isFade ? "fade" : "high_growth",
      revenueGrowthPct: roundTo(growthPct, 2),
      ebitMarginPct: roundTo(marginPct, 2),
      revenueB: roundTo(rev, 3),
      nopatB: roundTo(nopat, 3),
      reinvestmentB: roundTo(reinvestment, 3),
      fcffB: roundTo(fcff, 3),
      discountFactor: roundTo(df, 4),
      pvFcffB: roundTo(pv, 3),
    });
  }
  return { schedule, pvExplicitFcffB: pvSum, lastRevB: rev };
}

/**
 * Damodaran value-driver 3-stage FCFF DCF with reinvestment linked to sales-to-capital
 * during explicit forecast and Gordon Growth with RONIC-constrained reinvestment at terminal.
 */
export function calculateMultiStageFcffDcf(input: MultiStageFcffInput): MultiStageFcffResult {
  const wacc = input.waccPct / 100;
  const gTerm = input.terminalGrowthPct / 100;
  if (wacc <= gTerm + 0.005) {
    throw new Error("WACC 必须高于永续增长率至少 0.50%，否则终值无收敛解。");
  }
  const taxRate = Math.max(0, Math.min(0.6, input.effectiveTaxRatePct / 100));
  const { schedule, pvExplicitFcffB, lastRevB } = projectExplicitFcffSchedule(input, wacc, taxRate);
  const totalYears = schedule.length;

  const terminalRevB = lastRevB * (1 + gTerm);
  const terminalNopatB = terminalRevB * (input.terminalEbitMarginPct / 100) * (1 - taxRate);
  const ronic = Math.max(wacc, input.terminalRonicPct / 100);
  const terminalReinvestRate = Math.max(0, Math.min(0.85, gTerm / ronic));
  const terminalFcffB = terminalNopatB * (1 - terminalReinvestRate);
  const terminalValueB = terminalFcffB / (wacc - gTerm);
  const pvTerminalValueB = terminalValueB / (1 + wacc) ** totalYears;

  const enterpriseValueB = Math.max(0, pvExplicitFcffB + pvTerminalValueB);
  const bridge = calculateEquityBridge({
    enterpriseValueB,
    cashAndStInvestmentsB: input.cashAndStInvestmentsB,
    totalDebtB: input.totalDebtB,
    operatingLeaseLiabilitiesB: input.operatingLeaseLiabilitiesB,
    preferredStockB: input.preferredStockB,
    minorityInterestB: input.minorityInterestB,
    nonOperatingAssetsB: input.nonOperatingAssetsB,
    basicSharesM: input.basicSharesM,
    optionGrants: input.optionGrants,
    rsuSharesM: input.rsuSharesM,
    assumedSharePrice: input.assumedSharePrice,
  });

  return {
    schedule,
    pvExplicitFcffB: roundTo(pvExplicitFcffB, 2),
    terminalNopatB: roundTo(terminalNopatB, 2),
    terminalReinvestmentRatePct: roundTo(terminalReinvestRate * 100, 1),
    terminalValueB: roundTo(terminalValueB, 2),
    pvTerminalValueB: roundTo(pvTerminalValueB, 2),
    terminalValueSharePct:
      enterpriseValueB > 0 ? roundTo((pvTerminalValueB / enterpriseValueB) * 100, 1) : 0,
    enterpriseValueB: bridge.enterpriseValueB,
    equityValueB: bridge.equityValueB,
    dilutedSharesM: bridge.dilutedSharesM,
    fairValuePerShare: bridge.fairValuePerShare,
  };
}
