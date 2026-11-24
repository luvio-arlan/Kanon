import type { SecAnnualFinancial } from "../schemas/research";
import { roundTo } from "./valuation-scenarios";

export type SecQualityGrade = "compounder" | "cyclical" | "capital_intensive" | "watch";

export interface SecQualitySummary {
  yearsCovered: number;
  latestFiscalYear: string;
  latestEps: number | null;
  revenueCagrPct: number | null;
  avgGrossMarginPct: number | null;
  latestGrossMarginPct: number | null;
  grossMarginDeltaBps: number | null;
  fcfConversionPct: number | null;
  capexIntensityPct: number | null;
  qualityGrade: SecQualityGrade;
  qualityLabel: string;
}

function computeRevenueCagr(annuals: readonly SecAnnualFinancial[]): number | null {
  const valid = annuals.filter(
    (row): row is SecAnnualFinancial & { revenue: number } =>
      typeof row.revenue === "number" && row.revenue > 0,
  );
  if (valid.length < 2) return null;
  const first = valid[0];
  const last = valid[valid.length - 1];
  if (!first || !last) return null;
  const span = valid.length - 1;
  return roundTo(((last.revenue / first.revenue) ** (1 / span) - 1) * 100, 1);
}

function computeMarginStats(annuals: readonly SecAnnualFinancial[]) {
  const margins = annuals
    .map((row) => row.grossMarginPct)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (margins.length === 0) {
    return { avg: null, latest: null, deltaBps: null };
  }
  const avg = roundTo(margins.reduce((s, v) => s + v, 0) / margins.length, 1);
  const latest = margins[margins.length - 1] ?? null;
  const first = margins[0] ?? null;
  const deltaBps =
    margins.length >= 2 && latest !== null && first !== null
      ? Math.round((latest - first) * 100)
      : null;
  return { avg, latest, deltaBps };
}

function computeCashMetrics(annuals: readonly SecAnnualFinancial[]) {
  const latest = annuals[annuals.length - 1];
  const capexIntensityPct =
    latest?.revenue && latest.revenue > 0 && latest.capex !== null
      ? roundTo((Math.abs(latest.capex) / latest.revenue) * 100, 1)
      : null;

  const validPairs = annuals.filter((row) => row.freeCashFlow !== null && row.netIncome !== null);
  const totalNi = validPairs.reduce((sum, row) => sum + (row.netIncome ?? 0), 0);
  const totalFcf = validPairs.reduce((sum, row) => sum + (row.freeCashFlow ?? 0), 0);

  if (totalNi > 0) {
    return { fcfConversionPct: roundTo((totalFcf / totalNi) * 100, 1), capexIntensityPct };
  }
  if (latest?.netIncome && latest.netIncome > 0 && latest.freeCashFlow !== null) {
    return {
      fcfConversionPct: roundTo((latest.freeCashFlow / latest.netIncome) * 100, 1),
      capexIntensityPct,
    };
  }
  return { fcfConversionPct: null, capexIntensityPct };
}

function classifyQuality(params: {
  avgMargin: number | null;
  fcfConversion: number | null;
  capexIntensity: number | null;
  hasNegativeNetIncome: boolean;
}): { grade: SecQualityGrade; label: string } {
  const { avgMargin, fcfConversion, capexIntensity, hasNegativeNetIncome } = params;
  if (
    !hasNegativeNetIncome &&
    (avgMargin ?? 0) >= 45 &&
    (fcfConversion ?? 0) >= 70 &&
    (capexIntensity ?? 100) <= 20
  ) {
    return { grade: "compounder", label: "高现金流复利" };
  }
  if ((capexIntensity ?? 0) >= 25) {
    return { grade: "capital_intensive", label: "重资本扩产期" };
  }
  if (hasNegativeNetIncome) {
    return { grade: "cyclical", label: "强周期波动" };
  }
  return { grade: "watch", label: "稳健待观察" };
}

export function analyzeSecQuality(
  annuals: readonly SecAnnualFinancial[],
): SecQualitySummary | null {
  if (annuals.length === 0) return null;
  const latest = annuals[annuals.length - 1];
  if (!latest) return null;

  const margins = computeMarginStats(annuals);
  const cash = computeCashMetrics(annuals);
  const hasNegativeNetIncome = annuals.some((row) => (row.netIncome ?? 0) < 0);
  const { grade, label } = classifyQuality({
    avgMargin: margins.avg,
    fcfConversion: cash.fcfConversionPct,
    capexIntensity: cash.capexIntensityPct,
    hasNegativeNetIncome,
  });

  return {
    yearsCovered: annuals.length,
    latestFiscalYear: latest.fiscalYear,
    latestEps: latest.dilutedEps,
    revenueCagrPct: computeRevenueCagr(annuals),
    avgGrossMarginPct: margins.avg,
    latestGrossMarginPct: margins.latest,
    grossMarginDeltaBps: margins.deltaBps,
    fcfConversionPct: cash.fcfConversionPct,
    capexIntensityPct: cash.capexIntensityPct,
    qualityGrade: grade,
    qualityLabel: label,
  };
}
