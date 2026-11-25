import type { LinkedOperatingDrivers, OperatingCaseDrivers } from "../../schemas/v7-research-os";
import { roundTo } from "../valuation-scenarios";

export interface LinkedOperatingModelInput {
  currentPrice: number;
  currentRevenueB: number;
  currentSharesM: number;
  cashB: number;
  totalDebtB: number;
  horizonYears: number;
  drivers: LinkedOperatingDrivers;
}

export interface OperatingScenarioOutput {
  endingRevenueB: number;
  endingEbitB: number;
  endingNetIncomeB: number;
  endingOwnerFcfB: number;
  cumulativeFcfB: number;
  endingNetCashB: number;
  endingSharesM: number;
  impliedEps: number;
  peTargetPrice: number;
  evFcfTargetPrice: number;
  evEbitTargetPrice: number;
  cagrPct: number;
}

export interface LinkedOperatingModelResult {
  bear: OperatingScenarioOutput;
  base: OperatingScenarioOutput;
  bull: OperatingScenarioOutput;
}

function projectFlows(startRev: number, years: number, caseDrv: OperatingCaseDrivers) {
  const revGrowth = Math.max(-0.4, caseDrv.revenueCagrPct / 100);
  const tax = Math.min(0.45, Math.max(0, caseDrv.taxRatePct / 100));
  let rev = startRev;
  let cumulativeFcf = 0;
  let endingEbit = 0;
  let endingNetIncome = 0;
  let endingOwnerFcf = 0;
  for (let y = 1; y <= years; y += 1) {
    rev *= 1 + revGrowth;
    endingEbit = rev * (caseDrv.targetOperatingMarginPct / 100);
    endingNetIncome = endingEbit * (1 - tax);
    const capexDrag = rev * (caseDrv.capexPctOfRev / 100) * 0.35;
    endingOwnerFcf = endingNetIncome - capexDrag;
    cumulativeFcf += endingOwnerFcf;
  }
  return { rev, cumulativeFcf, endingEbit, endingNetIncome, endingOwnerFcf };
}

function simulateCase(
  baseInput: Omit<LinkedOperatingModelInput, "drivers">,
  caseDrv: OperatingCaseDrivers,
  cashRetentionPct: number,
): OperatingScenarioOutput {
  const years = Math.max(1, Math.min(15, Math.round(baseInput.horizonYears)));
  const startShares = Math.max(0.01, baseInput.currentSharesM);
  const shareFactor = Math.max(0.5, 1 + caseDrv.annualShareChangePct / 100);
  const retention = Math.min(1, Math.max(0, cashRetentionPct / 100));
  const tax = Math.min(0.45, Math.max(0, caseDrv.taxRatePct / 100));
  const f = projectFlows(Math.max(0.01, baseInput.currentRevenueB), years, caseDrv);

  const endingSharesM = roundTo(Math.max(0.01, startShares * shareFactor ** years), 1);
  const retainedCash = f.cumulativeFcf >= 0 ? f.cumulativeFcf * retention : f.cumulativeFcf;
  const endingNetCashB = roundTo(baseInput.cashB - baseInput.totalDebtB + retainedCash, 2);
  const impliedEps = roundTo((f.endingNetIncome * 1000) / endingSharesM, 2);
  const peTargetPrice = roundTo(Math.max(0, impliedEps * caseDrv.terminalMultiple), 2);
  const evFcfEquityB = Math.max(0, f.endingOwnerFcf * caseDrv.terminalMultiple + endingNetCashB);
  const evFcfTargetPrice = roundTo((evFcfEquityB * 1000) / endingSharesM, 2);
  const evEbitMultiple = caseDrv.terminalMultiple * (1 - tax);
  const evEbitEquityB = Math.max(0, f.endingEbit * evEbitMultiple + endingNetCashB);
  const evEbitTargetPrice = roundTo((evEbitEquityB * 1000) / endingSharesM, 2);
  const cagrPct =
    evFcfTargetPrice <= 0
      ? -100
      : roundTo(
          ((evFcfTargetPrice / Math.max(0.01, baseInput.currentPrice)) ** (1 / years) - 1) * 100,
          1,
        );

  return {
    endingRevenueB: roundTo(f.rev, 2),
    endingEbitB: roundTo(f.endingEbit, 2),
    endingNetIncomeB: roundTo(f.endingNetIncome, 2),
    endingOwnerFcfB: roundTo(f.endingOwnerFcf, 2),
    cumulativeFcfB: roundTo(f.cumulativeFcf, 2),
    endingNetCashB,
    endingSharesM,
    impliedEps,
    peTargetPrice,
    evFcfTargetPrice,
    evEbitTargetPrice,
    cagrPct,
  };
}

export function calculateLinkedOperatingModel(
  input: LinkedOperatingModelInput,
): LinkedOperatingModelResult {
  const { drivers, ...common } = input;
  const retention = drivers.cashRetentionPct ?? 70;
  return {
    bear: simulateCase(common, drivers.bear, retention),
    base: simulateCase(common, drivers.base, retention),
    bull: simulateCase(common, drivers.bull, retention),
  };
}

export function deriveDefaultLinkedDrivers(params: {
  baseRevCagrPct: number;
  baseOperatingMarginPct: number;
  sbcPctOfRev: number;
  capexPctOfRev: number;
  basePe: number;
}): LinkedOperatingDrivers {
  const rev = Math.min(60, Math.max(-10, params.baseRevCagrPct));
  const margin = Math.min(70, Math.max(5, params.baseOperatingMarginPct));
  const mult = Math.min(45, Math.max(8, params.basePe));
  return {
    bear: {
      revenueCagrPct: roundTo(Math.max(-15, rev * 0.55), 1),
      targetOperatingMarginPct: roundTo(Math.max(2, margin - 5), 1),
      sbcPctOfRev: roundTo(params.sbcPctOfRev + 0.5, 1),
      taxRatePct: 20,
      capexPctOfRev: roundTo(params.capexPctOfRev, 1),
      annualShareChangePct: 0.5,
      terminalMultiple: roundTo(Math.max(8, mult * 0.72), 1),
    },
    base: {
      revenueCagrPct: roundTo(rev, 1),
      targetOperatingMarginPct: roundTo(margin, 1),
      sbcPctOfRev: roundTo(params.sbcPctOfRev, 1),
      taxRatePct: 18,
      capexPctOfRev: roundTo(params.capexPctOfRev, 1),
      annualShareChangePct: -1,
      terminalMultiple: roundTo(mult, 1),
    },
    bull: {
      revenueCagrPct: roundTo(Math.min(80, rev * 1.35 + 3), 1),
      targetOperatingMarginPct: roundTo(Math.min(78, margin + 4), 1),
      sbcPctOfRev: roundTo(Math.max(0, params.sbcPctOfRev - 0.5), 1),
      taxRatePct: 17,
      capexPctOfRev: roundTo(Math.max(1, params.capexPctOfRev - 1), 1),
      annualShareChangePct: -2,
      terminalMultiple: roundTo(Math.min(60, mult * 1.2), 1),
    },
    cashRetentionPct: 70,
  };
}
