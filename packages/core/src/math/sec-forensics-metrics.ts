import type { SecAnnualFinancial } from "../schemas/research";
import { roundTo } from "./valuation-scenarios";

export type ForensicGrade = "fortress" | "compounder" | "watch" | "caution";

function investedCapitalOf(row: SecAnnualFinancial): number | null {
  if (typeof row.stockholdersEquity !== "number") return null;
  return row.stockholdersEquity + (row.totalDebt ?? 0) - (row.cashAndEquiv ?? 0);
}

export function computeIncrementalRoic(annuals: readonly SecAnnualFinancial[]): number | null {
  if (annuals.length < 2) return null;
  const first = annuals[0];
  const last = annuals[annuals.length - 1];
  if (!first || !last) return null;
  if (typeof first.operatingIncome !== "number" || typeof last.operatingIncome !== "number") {
    return null;
  }
  const icFirst = investedCapitalOf(first);
  const icLast = investedCapitalOf(last);
  if (icFirst === null || icLast === null) return null;
  const deltaIc = icLast - icFirst;
  if (deltaIc <= 0) return null;
  const deltaNopat = (last.operatingIncome - first.operatingIncome) * 0.79;
  const raw = (deltaNopat / deltaIc) * 100;
  return roundTo(Math.max(-100, Math.min(250, raw)), 1);
}

export function computeSloanAccrualPct(latest: SecAnnualFinancial): number | null {
  if (
    typeof latest.netIncome !== "number" ||
    typeof latest.operatingCashFlow !== "number" ||
    typeof latest.revenue !== "number" ||
    latest.revenue <= 0
  ) {
    return null;
  }
  return roundTo(((latest.netIncome - latest.operatingCashFlow) / latest.revenue) * 100, 1);
}

export function computeRuleOf40(annuals: readonly SecAnnualFinancial[]): number | null {
  const latest = annuals[annuals.length - 1];
  const prev = annuals[annuals.length - 2];
  if (!latest || !prev || !latest.revenue || !prev.revenue || prev.revenue <= 0) return null;
  if (typeof latest.freeCashFlow !== "number") return null;
  const revYoY = ((latest.revenue - prev.revenue) / prev.revenue) * 100;
  const fcfMargin = (latest.freeCashFlow / latest.revenue) * 100;
  return roundTo(revYoY + fcfMargin, 1);
}

export function computeOcfToNetIncome(latest: SecAnnualFinancial): number | null {
  if (
    typeof latest.operatingCashFlow !== "number" ||
    typeof latest.netIncome !== "number" ||
    latest.netIncome <= 0
  ) {
    return null;
  }
  return roundTo((latest.operatingCashFlow / latest.netIncome) * 100, 1);
}

function classifyForensicGrade(score: number): { grade: ForensicGrade; label: string } {
  if (score >= 85) return { grade: "fortress", label: "A+ 法证堡垒" };
  if (score >= 70) return { grade: "compounder", label: "A 优质复利" };
  if (score >= 52) return { grade: "watch", label: "B 保持观察" };
  return { grade: "caution", label: "C 法证警惕" };
}

function tierBonus(
  value: number | null,
  high: number,
  mid: number,
  highPts: number,
  midPts: number,
) {
  if (value === null) return 0;
  if (value >= high) return highPts;
  return value >= mid ? midPts : 0;
}

export function scoreForensicQuality(params: {
  roicPct: number | null;
  ownerFcfConversionPct: number | null;
  sloanAccrualPct: number | null;
  netCash: number | null;
  redFlagCount: number;
  failFlagCount: number;
}): { score: number; grade: ForensicGrade; label: string } {
  const accrualBonus = params.sloanAccrualPct !== null && params.sloanAccrualPct <= 2 ? 6 : 0;
  const cashBonus = (params.netCash ?? -1) >= 0 ? 6 : 0;
  const raw =
    62 +
    tierBonus(params.roicPct, 20, 12, 14, 8) +
    tierBonus(params.ownerFcfConversionPct, 80, 60, 12, 6) +
    accrualBonus +
    cashBonus -
    params.redFlagCount * 9 -
    params.failFlagCount * 10;
  const score = Math.max(15, Math.min(98, Math.round(raw)));
  return { score, ...classifyForensicGrade(score) };
}

export interface WorkingCapitalCycle {
  dsoDays: number | null;
  dioDays: number | null;
  dpoDays: number | null;
  cashConversionCycleDays: number | null;
  nwcPctOfRevenue: number | null;
}

function resolveCogs(latest: SecAnnualFinancial): number | null {
  if (typeof latest.costOfRevenue === "number" && latest.costOfRevenue > 0) {
    return latest.costOfRevenue;
  }
  if (latest.revenue && latest.grossProfit !== null) {
    const implied = latest.revenue - latest.grossProfit;
    return implied > 0 ? implied : null;
  }
  return null;
}

function turnoverDays(
  balance: number | null | undefined,
  flow: number | null | undefined,
): number | null {
  if (typeof balance !== "number" || typeof flow !== "number" || flow <= 0) return null;
  return roundTo((balance / flow) * 365, 1);
}

function computeNwcPct(latest: SecAnnualFinancial): number | null {
  const rev = latest.revenue;
  if (!rev || rev <= 0) return null;
  if (typeof latest.accountsReceivable !== "number" || typeof latest.accountsPayable !== "number") {
    return null;
  }
  const nwc = latest.accountsReceivable + (latest.inventory ?? 0) - latest.accountsPayable;
  return roundTo((nwc / rev) * 100, 1);
}

export function computeWorkingCapitalCycle(latest: SecAnnualFinancial): WorkingCapitalCycle {
  const cogs = resolveCogs(latest);
  const dsoDays = turnoverDays(latest.accountsReceivable, latest.revenue);
  const dioDays = turnoverDays(latest.inventory, cogs);
  const dpoDays = turnoverDays(latest.accountsPayable, cogs);
  const cashConversionCycleDays =
    dsoDays !== null && dioDays !== null && dpoDays !== null
      ? roundTo(dsoDays + dioDays - dpoDays, 1)
      : null;
  return {
    dsoDays,
    dioDays,
    dpoDays,
    cashConversionCycleDays,
    nwcPctOfRevenue: computeNwcPct(latest),
  };
}

export interface CapitalAllocationProfile {
  capexPctOfOcf: number | null;
  buybackPctOfOcf: number | null;
  dividendPctOfOcf: number | null;
}

export function computeCapitalAllocation(latest: SecAnnualFinancial): CapitalAllocationProfile {
  const ocf = latest.operatingCashFlow;
  if (typeof ocf !== "number" || ocf <= 0) {
    return { capexPctOfOcf: null, buybackPctOfOcf: null, dividendPctOfOcf: null };
  }
  const pct = (val: number | null | undefined) =>
    typeof val === "number" ? roundTo((Math.abs(val) / ocf) * 100, 1) : null;
  return {
    capexPctOfOcf: pct(latest.capex),
    buybackPctOfOcf: pct(latest.shareRepurchases),
    dividendPctOfOcf: pct(latest.dividendsPaid),
  };
}

export interface ForensicRedFlag {
  id: string;
  severity: "warn" | "fail";
  label: string;
  detail: string;
}

export function makeForensicFlag(
  id: string,
  severity: "warn" | "fail",
  label: string,
  detail: string,
): ForensicRedFlag {
  return { id, severity, label, detail };
}

export function checkWorkingCapitalFlags(
  prev: SecAnnualFinancial | undefined,
  latest: SecAnnualFinancial,
): ForensicRedFlag[] {
  if (!prev?.revenue || !latest.revenue || prev.revenue <= 0) return [];
  const revYoY = ((latest.revenue - prev.revenue) / prev.revenue) * 100;
  const pairs: ReadonlyArray<[string, number | null | undefined, number | null | undefined]> = [
    ["存货", prev.inventory, latest.inventory],
    ["应收账款", prev.accountsReceivable, latest.accountsReceivable],
  ];
  return pairs.flatMap(([label, pVal, cVal]) => {
    if (!pVal || !cVal || pVal <= 0) return [];
    const growth = ((cVal - pVal) / pVal) * 100;
    if (growth - revYoY < 15) return [];
    const detail = `最新年度${label}同比 +${roundTo(growth, 1)}%，显著快于营收增速 +${roundTo(revYoY, 1)}%，建议核查渠道库存或回款节奏。`;
    return [makeForensicFlag(`wc-${label}`, "warn", `${label}增速高于营收`, detail)];
  });
}

export function buildLeverageFlag(
  latest: SecAnnualFinancial,
  debtToEquityPct: number | null,
  netCash: number | null,
): ForensicRedFlag | null {
  const negEq =
    typeof latest.stockholdersEquity === "number" &&
    latest.stockholdersEquity <= 0 &&
    (latest.totalDebt ?? 0) > 0;
  if (!negEq && !((debtToEquityPct ?? 0) >= 150 && (netCash ?? 0) < 0)) return null;
  const detail = negEq
    ? "股东权益为负且存在有息负债，需审视下行周期偿债与再融资压力。"
    : `总负债/股东权益达 ${debtToEquityPct}% 且处于净负债状态，需审视下行周期偿债压力。`;
  return makeForensicFlag("high-leverage", "warn", "资产负债表杠杆偏高", detail);
}
