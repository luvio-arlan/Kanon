import type { LinkedOperatingDrivers, OperatingCaseDrivers } from "../../schemas/v7-research-os";
import { roundTo } from "../valuation-scenarios";

const LEGACY_DA_TO_CAPEX_RATIO = 0.65;

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
  endingGrowthCapexB: number;
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

function resolveExplicitCaseDrivers(caseDrv: OperatingCaseDrivers, tax: number) {
  const daPct = caseDrv.daPctOfRev ?? caseDrv.capexPctOfRev * LEGACY_DA_TO_CAPEX_RATIO;
  const maintenanceCapexPct = caseDrv.maintenanceCapexPctOfRev ?? caseDrv.capexPctOfRev;
  const nwcDeltaPct = caseDrv.nwcPctOfIncrementalRev ?? 0;
  const peMultiple = caseDrv.peMultiple ?? caseDrv.terminalMultiple;
  const evFcfMultiple = caseDrv.evFcfMultiple ?? caseDrv.terminalMultiple;
  const evEbitMultiple = caseDrv.evEbitMultiple ?? caseDrv.terminalMultiple * (1 - tax);
  return { daPct, maintenanceCapexPct, nwcDeltaPct, peMultiple, evFcfMultiple, evEbitMultiple };
}

function projectFlows(
  startRev: number,
  years: number,
  caseDrv: OperatingCaseDrivers,
  treatSbcAsCashCost: boolean,
) {
  const revGrowth = Math.max(-0.4, caseDrv.revenueCagrPct / 100);
  const tax = Math.min(0.45, Math.max(0, caseDrv.taxRatePct / 100));
  const resolved = resolveExplicitCaseDrivers(caseDrv, tax);
  let rev = startRev;
  let cumulativeFcf = 0;
  let endingEbit = 0;
  let endingNetIncome = 0;
  let endingOwnerFcf = 0;
  let endingGrowthCapex = 0;
  for (let y = 1; y <= years; y += 1) {
    const prevRev = rev;
    rev *= 1 + revGrowth;
    const incrementalRev = rev - prevRev;
    endingEbit = rev * (caseDrv.targetOperatingMarginPct / 100);
    endingNetIncome = endingEbit * (1 - tax);
    const da = rev * (resolved.daPct / 100);
    const totalCapex = rev * (caseDrv.capexPctOfRev / 100);
    const maintCapex = rev * (resolved.maintenanceCapexPct / 100);
    const deltaNwc = incrementalRev * (resolved.nwcDeltaPct / 100);
    const sbcCashDrag = treatSbcAsCashCost ? rev * (caseDrv.sbcPctOfRev / 100) : 0;
    endingGrowthCapex = Math.max(0, totalCapex - maintCapex);
    endingOwnerFcf = endingNetIncome + da - maintCapex - deltaNwc - sbcCashDrag;
    cumulativeFcf += endingOwnerFcf;
  }
  return {
    rev,
    cumulativeFcf,
    endingEbit,
    endingNetIncome,
    endingOwnerFcf,
    endingGrowthCapex,
    resolved,
  };
}

function simulateCase(
  baseInput: Omit<LinkedOperatingModelInput, "drivers">,
  caseDrv: OperatingCaseDrivers,
  cashRetentionPct: number,
  treatSbcAsCashCost: boolean,
): OperatingScenarioOutput {
  const years = Math.max(1, Math.min(15, Math.round(baseInput.horizonYears)));
  const startShares = Math.max(0.01, baseInput.currentSharesM);
  const shareFactor = Math.max(0.5, 1 + caseDrv.annualShareChangePct / 100);
  const retention = Math.min(1, Math.max(0, cashRetentionPct / 100));
  const f = projectFlows(
    Math.max(0.01, baseInput.currentRevenueB),
    years,
    caseDrv,
    treatSbcAsCashCost,
  );

  const endingSharesM = roundTo(Math.max(0.01, startShares * shareFactor ** years), 1);
  const retainedCash = f.cumulativeFcf >= 0 ? f.cumulativeFcf * retention : f.cumulativeFcf;
  const endingNetCashB = roundTo(baseInput.cashB - baseInput.totalDebtB + retainedCash, 2);
  const impliedEps = roundTo((f.endingNetIncome * 1000) / endingSharesM, 2);
  const peTargetPrice = roundTo(Math.max(0, impliedEps * f.resolved.peMultiple), 2);
  const evFcfEquityB = Math.max(0, f.endingOwnerFcf * f.resolved.evFcfMultiple + endingNetCashB);
  const evFcfTargetPrice = roundTo((evFcfEquityB * 1000) / endingSharesM, 2);
  const evEbitEquityB = Math.max(0, f.endingEbit * f.resolved.evEbitMultiple + endingNetCashB);
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
    endingGrowthCapexB: roundTo(f.endingGrowthCapex, 2),
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
  const treatSbcAsCashCost = drivers.treatSbcAsCashCost ?? false;
  return {
    bear: simulateCase(common, drivers.bear, retention, treatSbcAsCashCost),
    base: simulateCase(common, drivers.base, retention, treatSbcAsCashCost),
    bull: simulateCase(common, drivers.bull, retention, treatSbcAsCashCost),
  };
}

function buildCaseDefaults(p: {
  rev: number;
  margin: number;
  sbc: number;
  tax: number;
  capex: number;
  shareChange: number;
  mult: number;
}): OperatingCaseDrivers {
  return {
    revenueCagrPct: roundTo(p.rev, 1),
    targetOperatingMarginPct: roundTo(p.margin, 1),
    sbcPctOfRev: roundTo(p.sbc, 1),
    taxRatePct: p.tax,
    capexPctOfRev: roundTo(p.capex, 1),
    daPctOfRev: roundTo(p.capex * LEGACY_DA_TO_CAPEX_RATIO, 1),
    maintenanceCapexPctOfRev: roundTo(p.capex, 1),
    nwcPctOfIncrementalRev: 0,
    annualShareChangePct: p.shareChange,
    terminalMultiple: roundTo(p.mult, 1),
    peMultiple: roundTo(p.mult, 1),
    evFcfMultiple: roundTo(p.mult, 1),
    evEbitMultiple: roundTo(p.mult * (1 - p.tax / 100), 1),
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
    bear: buildCaseDefaults({
      rev: Math.max(-15, rev * 0.55),
      margin: Math.max(2, margin - 5),
      sbc: params.sbcPctOfRev + 0.5,
      tax: 20,
      capex: params.capexPctOfRev,
      shareChange: 0.5,
      mult: Math.max(8, mult * 0.72),
    }),
    base: buildCaseDefaults({
      rev,
      margin,
      sbc: params.sbcPctOfRev,
      tax: 18,
      capex: params.capexPctOfRev,
      shareChange: -1,
      mult,
    }),
    bull: buildCaseDefaults({
      rev: Math.min(80, rev * 1.35 + 3),
      margin: Math.min(78, margin + 4),
      sbc: Math.max(0, params.sbcPctOfRev - 0.5),
      tax: 17,
      capex: Math.max(1, params.capexPctOfRev - 1),
      shareChange: -2,
      mult: Math.min(60, mult * 1.2),
    }),
    cashRetentionPct: 70,
    treatSbcAsCashCost: false,
  };
}
