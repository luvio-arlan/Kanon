import {
  normalizeTransactionsToSplitBasis,
  type ReplayedLot,
  type ReplayTxInput,
  replayLedgerTransactions,
  type SplitActionInput,
} from "../../../math/performance";
import { roundTo } from "../../../math/valuation-scenarios";

export interface LedgerHoldingWeight {
  ticker: string;
  shares: number;
  marketValue: number;
  weightPct: number;
}

export interface LedgerPortfolioWeights {
  totalNav: number;
  cashBalance: number;
  cashWeightPct: number;
  holdings: LedgerHoldingWeight[];
  missingPriceTickers: string[];
}

function aggregateOpenLots(
  openLots: readonly ReplayedLot[],
  latestCloseByTicker: ReadonlyMap<string, number>,
) {
  const byTicker = new Map<string, { shares: number; costValue: number }>();
  for (const lot of openLots) {
    const t = lot.ticker.trim().toUpperCase();
    const cur = byTicker.get(t) ?? { shares: 0, costValue: 0 };
    cur.shares += lot.remainingQty;
    cur.costValue += lot.remainingQty * lot.costBasisPerShare;
    byTicker.set(t, cur);
  }
  const missingPriceTickers: string[] = [];
  const rawHoldings: Array<{ ticker: string; shares: number; marketValue: number }> = [];
  let equityValue = 0;
  for (const [ticker, pos] of byTicker) {
    if (pos.shares <= 1e-6) continue;
    const latestClose = latestCloseByTicker.get(ticker);
    const mv = latestClose !== undefined ? pos.shares * latestClose : pos.costValue;
    if (latestClose === undefined) missingPriceTickers.push(ticker);
    equityValue += mv;
    rawHoldings.push({ ticker, shares: pos.shares, marketValue: mv });
  }
  return { rawHoldings, equityValue, missingPriceTickers };
}

/**
 * Computes real split-basis NAV weights (`w_i = q̃_i * P̃_{i,T} / NAV_T`, `w_cash = cash_T / NAV_T`)
 * directly from a tenant's own ledger transactions (U0-5 / U0-9).
 */
export function computeLedgerPortfolioWeights(params: {
  transactions: readonly ReplayTxInput[];
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>;
  latestCloseByTicker: ReadonlyMap<string, number>;
  asOfDate: string;
}): LedgerPortfolioWeights {
  const normalizedTxs = normalizeTransactionsToSplitBasis(
    params.transactions,
    params.splitsByTicker,
  );
  const replayed = replayLedgerTransactions({
    transactions: normalizedTxs,
    splitsByTicker: new Map(),
    asOfDate: params.asOfDate,
  });
  if (!replayed.ok) {
    return { totalNav: 0, cashBalance: 0, cashWeightPct: 0, holdings: [], missingPriceTickers: [] };
  }
  const { rawHoldings, equityValue, missingPriceTickers } = aggregateOpenLots(
    replayed.openLots,
    params.latestCloseByTicker,
  );
  const cashBalance = Math.max(0, replayed.cashBalance);
  const totalNav = cashBalance + equityValue;
  if (totalNav <= 1e-6) {
    return {
      totalNav: 0,
      cashBalance: roundTo(cashBalance, 2),
      cashWeightPct: 0,
      holdings: [],
      missingPriceTickers,
    };
  }
  const holdings = rawHoldings
    .map((h) => ({
      ticker: h.ticker,
      shares: roundTo(h.shares, 6),
      marketValue: roundTo(h.marketValue, 2),
      weightPct: roundTo((h.marketValue / totalNav) * 100, 4),
    }))
    .sort((a, b) => b.weightPct - a.weightPct);
  return {
    totalNav: roundTo(totalNav, 2),
    cashBalance: roundTo(cashBalance, 2),
    cashWeightPct: roundTo((cashBalance / totalNav) * 100, 4),
    holdings,
    missingPriceTickers,
  };
}
