import {
  calculateMultiStageFcffDcf,
  evaluateConsecutiveKpiPeriods,
  evaluateSafeKpiExpression,
  type MultiStageFcffInput,
  type MultiStageFcffResult,
  roundTo,
  type SecAnnualFinancial,
} from "@kanon/core";

export interface PeriodComparisonResult {
  fromYear: string;
  toYear: string;
  revenueDeltaPct: number | null;
  grossMarginDeltaBps: number | null;
  fcfDeltaPct: number | null;
  epsDeltaPct: number | null;
}

function pctChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (
    from === null ||
    from === undefined ||
    to === null ||
    to === undefined ||
    Math.abs(from) < 1e-9
  ) {
    return null;
  }
  return roundTo(((to - from) / Math.abs(from)) * 100, 1);
}

/** Deterministic what-if DCF calculation tool — ensures AI IC never invents valuation math. */
export function runValuationWhatIfTool(
  baseInput: MultiStageFcffInput,
  overrides: Partial<MultiStageFcffInput>,
): {
  baseline: MultiStageFcffResult;
  scenario: MultiStageFcffResult;
  deltaPerShare: number;
  deltaPct: number;
} {
  const baseline = calculateMultiStageFcffDcf(baseInput);
  const scenario = calculateMultiStageFcffDcf({ ...baseInput, ...overrides });
  const deltaPerShare = roundTo(scenario.fairValuePerShare - baseline.fairValuePerShare, 2);
  const deltaPct =
    baseline.fairValuePerShare > 0
      ? roundTo((deltaPerShare / baseline.fairValuePerShare) * 100, 1)
      : 0;
  return { baseline, scenario, deltaPerShare, deltaPct };
}

/** Deterministic multi-period comparison over structured SEC annual financial records. */
export function compareSecPeriodsTool(
  annuals: readonly SecAnnualFinancial[],
  fromFiscalYear: string,
  toFiscalYear: string,
): PeriodComparisonResult | null {
  const a = annuals.find((r) => r.fiscalYear === fromFiscalYear);
  const b = annuals.find((r) => r.fiscalYear === toFiscalYear);
  if (!a || !b) return null;
  const grossMarginDeltaBps =
    a.grossMarginPct !== null && b.grossMarginPct !== null
      ? Math.round((b.grossMarginPct - a.grossMarginPct) * 100)
      : null;
  return {
    fromYear: a.fiscalYear,
    toYear: b.fiscalYear,
    revenueDeltaPct: pctChange(a.revenue, b.revenue),
    grossMarginDeltaBps,
    fcfDeltaPct: pctChange(a.freeCashFlow, b.freeCashFlow),
    epsDeltaPct: pctChange(a.dilutedEps, b.dilutedEps),
  };
}

/** Deterministic KPI rule verification tool wrapping the safe zero-eval expression parser. */
export function evaluateKpiRuleTool(params: {
  expression: string;
  periodSeries: readonly Readonly<Record<string, number>>[];
  consecutivePeriods?: number;
}) {
  const latest = params.periodSeries[params.periodSeries.length - 1] ?? {};
  const single = evaluateSafeKpiExpression(params.expression, latest);
  const streak = evaluateConsecutiveKpiPeriods(
    params.expression,
    params.periodSeries,
    params.consecutivePeriods ?? 1,
  );
  return { latestEvaluation: single, ...streak };
}
