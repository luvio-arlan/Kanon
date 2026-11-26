import { roundTo } from "../valuation-scenarios";

export interface BeneishPeriodInput {
  revenue: number;
  costOfRevenue: number;
  sgaExpense: number;
  depreciation: number;
  netIncome: number;
  operatingCashFlow: number;
  accountsReceivable: number;
  currentAssets: number;
  ppeNet: number;
  totalAssets: number;
  currentLiabilities: number;
  longTermDebt: number;
}

export interface BeneishMScoreResult {
  mScore: number;
  flaggedManipulator: boolean;
  components: {
    dsri: number;
    gmi: number;
    aqi: number;
    sgi: number;
    depi: number;
    sgai: number;
    lvgi: number;
    tata: number;
  };
}

function safeRatio(num: number, den: number, fallback = 1): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || Math.abs(den) < 1e-9) return fallback;
  return num / den;
}

function computeBeneishRatios(current: BeneishPeriodInput, prior: BeneishPeriodInput) {
  const dsri = safeRatio(
    safeRatio(current.accountsReceivable, current.revenue, 0),
    safeRatio(prior.accountsReceivable, prior.revenue, 0),
  );
  const gmi = safeRatio(
    safeRatio(prior.revenue - prior.costOfRevenue, prior.revenue, 0),
    safeRatio(current.revenue - current.costOfRevenue, current.revenue, 0),
  );
  const aqi = safeRatio(
    1 - safeRatio(current.currentAssets + current.ppeNet, current.totalAssets, 1),
    1 - safeRatio(prior.currentAssets + prior.ppeNet, prior.totalAssets, 1),
  );
  const sgi = safeRatio(current.revenue, prior.revenue);
  const depi = safeRatio(
    safeRatio(prior.depreciation, prior.depreciation + prior.ppeNet, 0),
    safeRatio(current.depreciation, current.depreciation + current.ppeNet, 0),
  );
  const sgai = safeRatio(
    safeRatio(current.sgaExpense, current.revenue, 0),
    safeRatio(prior.sgaExpense, prior.revenue, 0),
  );
  const lvgi = safeRatio(
    safeRatio(current.longTermDebt + current.currentLiabilities, current.totalAssets),
    safeRatio(prior.longTermDebt + prior.currentLiabilities, prior.totalAssets),
  );
  const tata = safeRatio(current.netIncome - current.operatingCashFlow, current.totalAssets, 0);
  return { dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata };
}

/**
 * 8-variable Beneish M-Score (1999) for earnings manipulation detection.
 * Threshold: M-Score > -1.78 signals elevated manipulation risk.
 */
export function calculateBeneishMScore(
  current: BeneishPeriodInput,
  prior: BeneishPeriodInput,
): BeneishMScoreResult {
  const r = computeBeneishRatios(current, prior);
  const mScore =
    -4.84 +
    0.92 * r.dsri +
    0.528 * r.gmi +
    0.404 * r.aqi +
    0.892 * r.sgi +
    0.115 * r.depi -
    0.172 * r.sgai +
    4.679 * r.tata -
    0.327 * r.lvgi;

  return {
    mScore: roundTo(mScore, 2),
    flaggedManipulator: mScore > -1.78,
    components: {
      dsri: roundTo(r.dsri, 3),
      gmi: roundTo(r.gmi, 3),
      aqi: roundTo(r.aqi, 3),
      sgi: roundTo(r.sgi, 3),
      depi: roundTo(r.depi, 3),
      sgai: roundTo(r.sgai, 3),
      lvgi: roundTo(r.lvgi, 3),
      tata: roundTo(r.tata, 4),
    },
  };
}
