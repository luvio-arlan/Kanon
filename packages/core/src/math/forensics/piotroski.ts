export interface PiotroskiPeriodInput {
  netIncome: number;
  operatingCashFlow: number;
  totalAssets: number;
  longTermDebt: number;
  currentAssets: number;
  currentLiabilities: number;
  dilutedShares: number;
  grossProfit: number;
  revenue: number;
}

export interface PiotroskiFScoreResult {
  score: number;
  grade: "strong" | "neutral" | "weak";
  signals: {
    positiveRoa: boolean;
    positiveOcf: boolean;
    improvingRoa: boolean;
    cashExceedsEarnings: boolean;
    lowerLeverage: boolean;
    higherLiquidity: boolean;
    noShareDilution: boolean;
    higherGrossMargin: boolean;
    higherAssetTurnover: boolean;
  };
}

function ratio(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

/** 9-point Piotroski F-Score evaluating profitability, leverage/liquidity, and operating efficiency. */
export function calculatePiotroskiFScore(
  current: PiotroskiPeriodInput,
  prior: PiotroskiPeriodInput,
): PiotroskiFScoreResult {
  const currRoa = ratio(current.netIncome, current.totalAssets);
  const priorRoa = ratio(prior.netIncome, prior.totalAssets);
  const signals = {
    positiveRoa: currRoa > 0,
    positiveOcf: current.operatingCashFlow > 0,
    improvingRoa: currRoa > priorRoa,
    cashExceedsEarnings: current.operatingCashFlow > current.netIncome,
    lowerLeverage:
      ratio(current.longTermDebt, current.totalAssets) <=
      ratio(prior.longTermDebt, prior.totalAssets),
    higherLiquidity:
      ratio(current.currentAssets, current.currentLiabilities) >
      ratio(prior.currentAssets, prior.currentLiabilities),
    noShareDilution: current.dilutedShares <= prior.dilutedShares * 1.005,
    higherGrossMargin:
      ratio(current.grossProfit, current.revenue) > ratio(prior.grossProfit, prior.revenue),
    higherAssetTurnover:
      ratio(current.revenue, current.totalAssets) > ratio(prior.revenue, prior.totalAssets),
  };
  const score = Object.values(signals).filter(Boolean).length;
  const grade = score >= 7 ? "strong" : score <= 3 ? "weak" : "neutral";
  return { score, grade, signals };
}
