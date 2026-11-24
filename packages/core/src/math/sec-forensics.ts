import type { SecAnnualFinancial, SecQuarterlyFinancial } from "../schemas/research";
import {
  computeIncrementalRoic,
  computeOcfToNetIncome,
  computeRuleOf40,
  computeSloanAccrualPct,
  type ForensicGrade,
  scoreForensicQuality,
} from "./sec-forensics-metrics";
import { roundTo } from "./valuation-scenarios";

export type { ForensicGrade };

export interface ForensicRedFlag {
  id: string;
  severity: "warn" | "fail";
  label: string;
  detail: string;
}

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

function computeShareCagr(annuals: readonly SecAnnualFinancial[]): number | null {
  const rows = annuals.filter((r) => typeof r.dilutedShares === "number" && r.dilutedShares > 0);
  const firstS = rows[0]?.dilutedShares;
  const lastS = rows[rows.length - 1]?.dilutedShares;
  if (rows.length < 2 || !firstS || !lastS) return null;
  return roundTo(((lastS / firstS) ** (1 / (rows.length - 1)) - 1) * 100, 2);
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

function checkWorkingCapitalFlag(
  prev: SecAnnualFinancial | undefined,
  latest: SecAnnualFinancial,
): ForensicRedFlag | null {
  if (!prev?.revenue || !latest.revenue || prev.revenue <= 0) return null;
  const revYoY = ((latest.revenue - prev.revenue) / prev.revenue) * 100;
  const checkItem = (
    label: string,
    pVal: number | null | undefined,
    cVal: number | null | undefined,
  ) => {
    if (!pVal || !cVal || pVal <= 0) return null;
    const growth = ((cVal - pVal) / pVal) * 100;
    if (growth - revYoY >= 15) {
      return {
        id: `wc-${label}`,
        severity: "warn" as const,
        label: `${label}增速高于营收`,
        detail: `最新年度${label}同比 +${roundTo(growth, 1)}%，显著快于营收增速 +${roundTo(revYoY, 1)}%，建议核查渠道库存或回款节奏。`,
      };
    }
    return null;
  };
  return (
    checkItem("存货", prev.inventory, latest.inventory) ??
    checkItem("应收账款", prev.accountsReceivable, latest.accountsReceivable)
  );
}

function buildRedFlags(params: {
  annuals: readonly SecAnnualFinancial[];
  latest: SecAnnualFinancial;
  ownerFcf: number | null;
  sbcPctOfOcf: number | null;
  shareChangeCagrPct: number | null;
  debtToEquityPct: number | null;
  netCash: number | null;
  sloanAccrualPct: number | null;
}): ForensicRedFlag[] {
  const flags: ForensicRedFlag[] = [];
  if ((params.sbcPctOfOcf ?? 0) >= 25) {
    flags.push({
      id: "sbc-heavy",
      severity: "warn",
      label: "SBC 现金流吞噬偏高",
      detail: `股权激励占经营现金流 ${params.sbcPctOfOcf}%，估值时建议扣除 SBC 按 Owner FCF 计算。`,
    });
  }
  if ((params.shareChangeCagrPct ?? 0) >= 2.5) {
    flags.push({
      id: "share-dilution",
      severity: "warn",
      label: "股本持续净稀释",
      detail: `稀释股本年化扩张 +${params.shareChangeCagrPct}%，长期复利会向员工期权分流。`,
    });
  }
  if ((params.latest.netIncome ?? 0) > 0 && params.ownerFcf !== null && params.ownerFcf < 0) {
    flags.push({
      id: "negative-owner-fcf",
      severity: "fail",
      label: "账面盈利但真实 FCF 转负",
      detail: "扣除资本开支与 SBC 后 Owner FCF 为负，需重点核验资本开支回报周期与盈利质量。",
    });
  }
  if ((params.debtToEquityPct ?? 0) >= 150 && (params.netCash ?? 0) < 0) {
    flags.push({
      id: "high-leverage",
      severity: "warn",
      label: "资产负债表杠杆偏高",
      detail: `总负债/股东权益达 ${params.debtToEquityPct}% 且处于净负债状态，需审视下行周期偿债压力。`,
    });
  }
  const wcFlag = checkWorkingCapitalFlag(params.annuals[params.annuals.length - 2], params.latest);
  if (wcFlag) flags.push(wcFlag);
  return flags;
}

function detectForensicFlags(params: Parameters<typeof buildRedFlags>[0]): ForensicRedFlag[] {
  const flags = buildRedFlags(params);
  if ((params.sloanAccrualPct ?? 0) >= 10) {
    flags.push({
      id: "accrual-anomaly",
      severity: "warn",
      label: "Sloan 应计项占比偏高",
      detail: `净利与经营现金流差额占营收 ${params.sloanAccrualPct}%，盈利现金含金量偏弱，建议核查收入确认政策。`,
    });
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
  const roiicPct = computeIncrementalRoic(annuals);
  const sloanAccrualPct = computeSloanAccrualPct(latest);
  const ruleOf40Score = computeRuleOf40(annuals);
  const ocfToNetIncomePct = computeOcfToNetIncome(latest);
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
  const failCount = redFlags.filter((f) => f.severity === "fail").length;
  const scored = scoreForensicQuality({
    roicPct: ret.roicPct,
    ownerFcfConversionPct: sbc.ownerFcfConversionPct,
    sloanAccrualPct,
    netCash: ret.netCash,
    redFlagCount: redFlags.length,
    failFlagCount: failCount,
  });

  return {
    latestFiscalYear: latest.fiscalYear,
    ...ret,
    ...sbc,
    latestQuarterLabel: latestQ?.periodLabel ?? null,
    latestQuarterRevYoYPct: latestQ?.revenueYoYPct ?? null,
    latestQuarterGmYoYBps: latestQ?.grossMarginYoYBps ?? null,
    roiicPct,
    sloanAccrualPct,
    ruleOf40Score,
    ocfToNetIncomePct,
    forensicScore: scored.score,
    forensicGrade: scored.grade,
    forensicGradeLabel: scored.label,
    redFlags,
  };
}
