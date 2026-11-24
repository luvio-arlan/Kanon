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
