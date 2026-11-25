import type { SecAnnualFinancial, SecQuarterlyFinancial } from "../schemas/research";
import {
  buildLeverageFlag,
  type CapitalAllocationProfile,
  checkWorkingCapitalFlags,
  computeCapitalAllocation,
  computeIncrementalRoic,
  computeOcfToNetIncome,
  computeRuleOf40,
  computeSloanAccrualPct,
  computeWorkingCapitalCycle,
  type ForensicGrade,
  type ForensicRedFlag,
  makeForensicFlag,
  scoreForensicQuality,
  type WorkingCapitalCycle,
} from "./sec-forensics-metrics";
import { roundTo } from "./valuation-scenarios";

export type { CapitalAllocationProfile, ForensicGrade, ForensicRedFlag, WorkingCapitalCycle };

export interface SecForensicReport {
  latestFiscalYear: string;
  roicPct: number | null;
  roePct: number | null;
  ownerFcf: number | null;
  ownerFcfConversionPct: number | null;
  sbcPctOfOcf: number | null;
  sbcPctOfRevenue: number | null;
  shareChangeCagrPct: number | null;
  netCash: number | null;
  debtToEquityPct: number | null;
  rdIntensityPct: number | null;
  latestQuarterLabel: string | null;
  latestQuarterRevYoYPct: number | null;
  latestQuarterGmYoYBps: number | null;
  roiicPct: number | null;
  sloanAccrualPct: number | null;
  ruleOf40Score: number | null;
  ocfToNetIncomePct: number | null;
  forensicScore: number;
  forensicGrade: ForensicGrade;
  forensicGradeLabel: string;
  workingCapitalCycle: WorkingCapitalCycle;
  capitalAllocation: CapitalAllocationProfile;
  redFlags: ForensicRedFlag[];
}

function safeRatioPct(
  num: number | null | undefined,
  den: number | null | undefined,
): number | null {
  if (typeof num !== "number" || typeof den !== "number" || den <= 0) return null;
  return roundTo((num / den) * 100, 1);
}

function computeReturnMetrics(latest: SecAnnualFinancial) {
  const ebit = latest.operatingIncome ?? null;
  const equity = latest.stockholdersEquity ?? null;
  const debt = latest.totalDebt ?? 0;
  const cash = latest.cashAndEquiv ?? 0;
  const investedCapital = equity !== null ? equity + debt - cash : null;
  const roicPct = ebit !== null ? safeRatioPct(ebit * 0.79, investedCapital) : null;
  const roePct = safeRatioPct(latest.netIncome, equity);
  const netCash = typeof latest.cashAndEquiv === "number" ? latest.cashAndEquiv - debt : null;
  const debtToEquityPct = safeRatioPct(latest.totalDebt, equity);
  return { roicPct, roePct, netCash, debtToEquityPct };
}

function parseFiscalYearNum(fiscalYear: string): number | null {
  const n = Number(fiscalYear.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n >= 1900 && n <= 2200 ? n : null;
}

function computeShareCagr(annuals: readonly SecAnnualFinancial[]): number | null {
  const rows = annuals.filter((r) => typeof r.dilutedShares === "number" && r.dilutedShares > 0);
  if (rows.length < 2) return null;
  for (let i = 1; i < rows.length; i += 1) {
    const prevS = rows[i - 1]?.dilutedShares ?? 0;
    const curS = rows[i]?.dilutedShares ?? 0;
    if (prevS > 0 && (curS / prevS >= 1.8 || prevS / curS >= 1.8)) return null;
  }
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  const firstS = firstRow?.dilutedShares;
  const lastS = lastRow?.dilutedShares;
  if (!firstRow || !lastRow || !firstS || !lastS) return null;
  const fyStart = parseFiscalYearNum(firstRow.fiscalYear);
  const fyEnd = parseFiscalYearNum(lastRow.fiscalYear);
  const span = fyStart && fyEnd && fyEnd > fyStart ? fyEnd - fyStart : rows.length - 1;
  return roundTo(((lastS / firstS) ** (1 / span) - 1) * 100, 2);
}

function computeSbcAndShares(annuals: readonly SecAnnualFinancial[], latest: SecAnnualFinancial) {
  const sbcAbs = typeof latest.sbc === "number" ? Math.abs(latest.sbc) : null;
  const ownerFcf = latest.freeCashFlow !== null ? latest.freeCashFlow - (sbcAbs ?? 0) : null;
  return {
    ownerFcf,
    ownerFcfConversionPct: safeRatioPct(ownerFcf, latest.netIncome),
    sbcPctOfOcf: safeRatioPct(sbcAbs, latest.operatingCashFlow),
    sbcPctOfRevenue: safeRatioPct(sbcAbs, latest.revenue),
    shareChangeCagrPct: computeShareCagr(annuals),
    rdIntensityPct: safeRatioPct(
      typeof latest.rdExpense === "number" ? Math.abs(latest.rdExpense) : null,
      latest.revenue,
    ),
  };
}

function detectCashAndDilutionFlags(p: {
  latest: SecAnnualFinancial;
  ownerFcf: number | null;
  sbcPctOfOcf: number | null;
  shareChangeCagrPct: number | null;
}): ForensicRedFlag[] {
  const flags: ForensicRedFlag[] = [];
  if ((p.sbcPctOfOcf ?? 0) >= 25) {
    const detail = `股权激励占经营现金流 ${p.sbcPctOfOcf}%，估值时建议扣除 SBC 按 Owner FCF 计算。`;
    flags.push(makeForensicFlag("sbc-heavy", "warn", "SBC 现金流吞噬偏高", detail));
  }
  if ((p.shareChangeCagrPct ?? 0) >= 2.5) {
    const detail = `稀释股本年化扩张 +${p.shareChangeCagrPct}%，长期复利会向员工期权分流。`;
    flags.push(makeForensicFlag("share-dilution", "warn", "股本持续净稀释", detail));
  }
  if ((p.latest.netIncome ?? 0) > 0 && p.ownerFcf !== null && p.ownerFcf < 0) {
    const detail = "扣除资本开支与 SBC 后 Owner FCF 为负，需重点核验资本开支回报周期与盈利质量。";
    flags.push(makeForensicFlag("negative-owner-fcf", "fail", "账面盈利但真实 FCF 转负", detail));
  }
  return flags;
}

function detectForensicFlags(p: {
  annuals: readonly SecAnnualFinancial[];
  latest: SecAnnualFinancial;
  ownerFcf: number | null;
  sbcPctOfOcf: number | null;
  shareChangeCagrPct: number | null;
  debtToEquityPct: number | null;
  netCash: number | null;
  sloanAccrualPct: number | null;
}): ForensicRedFlag[] {
  const flags = detectCashAndDilutionFlags(p);
  const lev = buildLeverageFlag(p.latest, p.debtToEquityPct, p.netCash);
  if (lev) flags.push(lev);
  flags.push(...checkWorkingCapitalFlags(p.annuals[p.annuals.length - 2], p.latest));
  if ((p.sloanAccrualPct ?? 0) >= 10) {
    const detail = `净利与经营现金流差额占营收 ${p.sloanAccrualPct}%，盈利现金含金量偏弱，建议核查收入确认政策。`;
    flags.push(makeForensicFlag("accrual-anomaly", "warn", "Sloan 应计项占比偏高", detail));
  }
  return flags;
}

export function analyzeSecForensics(
  annuals: readonly SecAnnualFinancial[],
  quarterlies: readonly SecQuarterlyFinancial[] = [],
): SecForensicReport | null {
  const latest = annuals[annuals.length - 1];
  if (!latest) return null;
  const ret = computeReturnMetrics(latest);
  const sbc = computeSbcAndShares(annuals, latest);
  const latestQ = quarterlies[quarterlies.length - 1];
  const sloanAccrualPct = computeSloanAccrualPct(latest);
  const redFlags = detectForensicFlags({
    annuals,
    latest,
    ownerFcf: sbc.ownerFcf,
    sbcPctOfOcf: sbc.sbcPctOfOcf,
    shareChangeCagrPct: sbc.shareChangeCagrPct,
    debtToEquityPct: ret.debtToEquityPct,
    netCash: ret.netCash,
    sloanAccrualPct,
  });
  const scored = scoreForensicQuality({
    roicPct: ret.roicPct,
    ownerFcfConversionPct: sbc.ownerFcfConversionPct,
    sloanAccrualPct,
    netCash: ret.netCash,
    redFlagCount: redFlags.length,
    failFlagCount: redFlags.filter((f) => f.severity === "fail").length,
  });
  return {
    latestFiscalYear: latest.fiscalYear,
    ...ret,
    ...sbc,
    latestQuarterLabel: latestQ?.periodLabel ?? null,
    latestQuarterRevYoYPct: latestQ?.revenueYoYPct ?? null,
    latestQuarterGmYoYBps: latestQ?.grossMarginYoYBps ?? null,
    roiicPct: computeIncrementalRoic(annuals),
    sloanAccrualPct,
    ruleOf40Score: computeRuleOf40(annuals),
    ocfToNetIncomePct: computeOcfToNetIncome(latest),
    forensicScore: scored.score,
    forensicGrade: scored.grade,
    forensicGradeLabel: scored.label,
    workingCapitalCycle: computeWorkingCapitalCycle(latest),
    capitalAllocation: computeCapitalAllocation(latest),
    redFlags,
  };
}
