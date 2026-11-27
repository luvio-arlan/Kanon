import {
  calculateAltmanZScore,
  calculateBeneishMScore,
  calculateDuPontDecomposition,
  calculatePiotroskiFScore,
  type SecAnnualFinancial,
} from "@kanon/core";

export interface VerifiedBalance {
  equity: number;
  assets: number;
  currentAssets: number | null;
  currentLiabilities: number | null;
  totalLiabilities: number;
  retainedEarnings: number | null;
  ppeNet: number | null;
}

/**
 * Strictly reads real SEC XBRL balance sheet lines with zero synthesis.
 * Enforces accounting identity gate: |Assets - (Liabilities + Equity)| / Assets <= 1%.
 */
export function readVerifiedBalance(row: SecAnnualFinancial): VerifiedBalance | null {
  if (
    row.totalAssets == null ||
    row.totalAssets <= 0 ||
    row.totalLiabilities == null ||
    row.stockholdersEquity == null
  ) {
    return null;
  }
  const imbalance =
    Math.abs(row.totalAssets - (row.totalLiabilities + row.stockholdersEquity)) / row.totalAssets;
  if (imbalance > 0.01) return null;
  return {
    equity: row.stockholdersEquity,
    assets: row.totalAssets,
    currentAssets: row.currentAssets ?? null,
    currentLiabilities: row.currentLiabilities ?? null,
    totalLiabilities: row.totalLiabilities,
    retainedEarnings: row.retainedEarnings ?? null,
    ppeNet: row.ppeNet ?? null,
  };
}

function buildBeneishPeriod(row: SecAnnualFinancial, b: VerifiedBalance) {
  if (
    row.revenue == null ||
    row.grossProfit == null ||
    row.netIncome == null ||
    row.operatingCashFlow == null ||
    row.accountsReceivable == null ||
    row.sgaExpense == null ||
    row.depreciation == null ||
    b.currentAssets == null ||
    b.currentLiabilities == null ||
    b.ppeNet == null
  ) {
    return null;
  }
  return {
    revenue: row.revenue,
    costOfRevenue: row.costOfRevenue ?? row.revenue - row.grossProfit,
    sgaExpense: row.sgaExpense,
    depreciation: row.depreciation,
    netIncome: row.netIncome,
    operatingCashFlow: row.operatingCashFlow,
    accountsReceivable: row.accountsReceivable,
    currentAssets: b.currentAssets,
    ppeNet: b.ppeNet,
    totalAssets: b.assets,
    currentLiabilities: b.currentLiabilities,
    longTermDebt: row.totalDebt ?? 0,
  };
}

function buildPiotroskiPeriod(row: SecAnnualFinancial, b: VerifiedBalance) {
  if (
    row.netIncome == null ||
    row.operatingCashFlow == null ||
    row.dilutedShares == null ||
    row.grossProfit == null ||
    row.revenue == null ||
    b.currentAssets == null ||
    b.currentLiabilities == null
  ) {
    return null;
  }
  return {
    netIncome: row.netIncome,
    operatingCashFlow: row.operatingCashFlow,
    totalAssets: b.assets,
    longTermDebt: row.totalDebt ?? 0,
    currentAssets: b.currentAssets,
    currentLiabilities: b.currentLiabilities,
    dilutedShares: row.dilutedShares,
    grossProfit: row.grossProfit,
    revenue: row.revenue,
  };
}

function isFinancialSic(sicCode?: string): boolean {
  const n = Number(sicCode);
  return Number.isFinite(n) && n >= 6000 && n <= 6999;
}

function computeAltmanIfAvailable(
  curr: SecAnnualFinancial,
  cb: VerifiedBalance | null,
  currentPrice?: number,
  sicCode?: string,
) {
  if (isFinancialSic(sicCode)) return null;
  if (
    !cb ||
    cb.currentAssets == null ||
    cb.currentLiabilities == null ||
    cb.retainedEarnings == null ||
    curr.operatingIncome == null ||
    curr.revenue == null
  ) {
    return null;
  }
  const shares = curr.sharesOutstanding ?? curr.dilutedShares;
  if (!currentPrice || currentPrice <= 0 || !shares || shares <= 0 || cb.totalLiabilities <= 0) {
    return null;
  }
  const res = calculateAltmanZScore({
    workingCapital: cb.currentAssets - cb.currentLiabilities,
    retainedEarnings: cb.retainedEarnings,
    ebit: curr.operatingIncome,
    marketCap: currentPrice * shares,
    bookEquity: cb.equity,
    totalLiabilities: cb.totalLiabilities,
    revenue: curr.revenue,
    totalAssets: cb.assets,
  });
  return res.applicable ? res : null;
}

function computeDupontIfAvailable(
  curr: SecAnnualFinancial,
  cb: VerifiedBalance | null,
  pb: VerifiedBalance | null,
) {
  if (!cb || !pb || cb.equity + pb.equity <= 0 || curr.netIncome == null || curr.revenue == null) {
    return null;
  }
  return calculateDuPontDecomposition({
    netIncome: curr.netIncome,
    pretaxIncome: curr.pretaxIncome ?? curr.operatingIncome ?? curr.netIncome,
    ebit: curr.operatingIncome ?? curr.netIncome,
    revenue: curr.revenue,
    averageAssets: (cb.assets + pb.assets) / 2,
    averageEquity: (cb.equity + pb.equity) / 2,
  });
}

function computePairForensics(
  curr: SecAnnualFinancial,
  prev: SecAnnualFinancial,
  cb: VerifiedBalance | null,
  pb: VerifiedBalance | null,
) {
  const curBen = cb ? buildBeneishPeriod(curr, cb) : null;
  const prevBen = pb ? buildBeneishPeriod(prev, pb) : null;
  const curPio = cb ? buildPiotroskiPeriod(curr, cb) : null;
  const prevPio = pb ? buildPiotroskiPeriod(prev, pb) : null;
  return {
    beneish: curBen && prevBen ? calculateBeneishMScore(curBen, prevBen) : null,
    piotroski: curPio && prevPio ? calculatePiotroskiFScore(curPio, prevPio) : null,
  };
}

export function computeHonestForensics(
  annuals: readonly SecAnnualFinancial[],
  currentPrice?: number,
  sicCode?: string,
) {
  if (annuals.length < 2) return null;
  const curr = annuals[annuals.length - 1];
  const prev = annuals[annuals.length - 2];
  if (!curr || !prev || curr.revenue == null || prev.revenue == null || curr.revenue <= 0) {
    return null;
  }
  const cb = readVerifiedBalance(curr);
  const pb = readVerifiedBalance(prev);
  const { beneish, piotroski } = computePairForensics(curr, prev, cb, pb);
  const altman = computeAltmanIfAvailable(curr, cb, currentPrice, sicCode);
  const dupont = computeDupontIfAvailable(curr, cb, pb);
  if (!beneish && !altman && !piotroski && !dupont) return null;
  return { beneish, altman, piotroski, dupont, fy: curr.fiscalYear };
}
