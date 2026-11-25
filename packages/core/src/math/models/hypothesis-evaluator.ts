import type { Hypothesis, HypothesisStatus } from "../../schemas/thesis";
import type { SecAnnualFinancial, SecQuarterlyFinancial } from "../../schemas/v4-extensions";
import type { HypothesisKpiMetric, HypothesisKpiRule } from "../../schemas/v7-research-os";
import { analyzeSecQuality } from "../sec-analytics";
import { analyzeSecForensics } from "../sec-forensics";
import { roundTo } from "../valuation-scenarios";

export interface HypothesisKpiEvaluation {
  metricKey: HypothesisKpiMetric;
  metricLabel: string;
  actualValue: number | null;
  formattedActual: string;
  formattedTarget: string;
  passed: boolean | null;
  suggestedStatus: HypothesisStatus;
  verdictText: string;
}

const METRIC_META: Record<HypothesisKpiMetric, { label: string; unit: "%" | "$B" }> = {
  grossMarginPct: { label: "综合毛利率", unit: "%" },
  revenueCagrPct: { label: "营收复合增速", unit: "%" },
  roicPct: { label: "投入资本回报率 (ROIC)", unit: "%" },
  fcfConversionPct: { label: "自由现金流转化率", unit: "%" },
  sbcPctOfOcf: { label: "SBC / 经营现金流", unit: "%" },
  netCashB: { label: "净现金头寸", unit: "$B" },
};

function formatMetricVal(val: number, unit: "%" | "$B"): string {
  return unit === "$B" ? `$${roundTo(val, 2)}B` : `${roundTo(val, 1)}%`;
}

function readActualMetric(
  metricKey: HypothesisKpiMetric,
  annuals: readonly SecAnnualFinancial[],
  quarterlies: readonly SecQuarterlyFinancial[],
): number | null {
  const latestAnnual = annuals[annuals.length - 1];
  const latestQ = quarterlies[quarterlies.length - 1];
  const quality = analyzeSecQuality(annuals);
  const forensics = analyzeSecForensics(annuals, quarterlies);

  if (metricKey === "grossMarginPct") {
    return latestQ?.grossMarginPct ?? quality?.latestGrossMarginPct ?? null;
  }
  if (metricKey === "revenueCagrPct") {
    return quality?.revenueCagrPct ?? latestQ?.revenueYoYPct ?? null;
  }
  if (metricKey === "roicPct") return forensics?.roicPct ?? null;
  if (metricKey === "fcfConversionPct") return quality?.fcfConversionPct ?? null;
  if (metricKey === "sbcPctOfOcf") return forensics?.sbcPctOfOcf ?? null;
  if (latestAnnual?.cashAndEquiv != null && latestAnnual.totalDebt != null) {
    return roundTo((latestAnnual.cashAndEquiv - latestAnnual.totalDebt) / 1e9, 2);
  }
  return null;
}

function compareRule(actual: number, rule: HypothesisKpiRule): boolean {
  if (rule.operator === ">=") return actual >= rule.targetValue;
  if (rule.operator === "<=") return actual <= rule.targetValue;
  if (rule.operator === ">") return actual > rule.targetValue;
  return actual < rule.targetValue;
}

export function evaluateHypothesisKpi(
  hypothesis: Hypothesis,
  annuals: readonly SecAnnualFinancial[],
  quarterlies: readonly SecQuarterlyFinancial[] = [],
): HypothesisKpiEvaluation | null {
  const rule = hypothesis.kpiRule;
  if (!rule) return null;
  const meta = METRIC_META[rule.metricKey];
  const actual = readActualMetric(rule.metricKey, annuals, quarterlies);
  const formattedTarget = `${rule.operator} ${formatMetricVal(rule.targetValue, meta.unit)}`;
  if (actual === null) {
    return {
      metricKey: rule.metricKey,
      metricLabel: meta.label,
      actualValue: null,
      formattedActual: "待同步",
      formattedTarget,
      passed: null,
      suggestedStatus: "watching",
      verdictText: `尚无 ${meta.label} 实测数据，请先同步财报`,
    };
  }
  const passed = compareRule(actual, rule);
  const formattedActual = formatMetricVal(actual, meta.unit);
  return {
    metricKey: rule.metricKey,
    metricLabel: meta.label,
    actualValue: actual,
    formattedActual,
    formattedTarget,
    passed,
    suggestedStatus: passed ? "validated" : "warning",
    verdictText: passed
      ? `实测 ${formattedActual}，满足红线 ${formattedTarget}`
      : `实测 ${formattedActual}，偏离红线 ${formattedTarget}`,
  };
}
