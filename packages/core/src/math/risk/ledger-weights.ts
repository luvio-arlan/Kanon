import { type CurrencyCode, inferCurrencyFromTicker } from "../../contracts/intel/primitives";
import {
  type DailyFxRatePoint,
  normalizeTransactionsToSplitBasis,
  type ReplayedLot,
  type ReplayTxInput,
  replayLedgerTransactions,
  resolveCrossFxRateOnDate,
  type SplitActionInput,
} from "../performance";
import { roundTo } from "../valuation-scenarios";

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
  fxMissingTickers: string[];
}

function aggregateOpenLots(
  openLots: readonly ReplayedLot[],
  latestCloseByTicker: ReadonlyMap<string, number>,
  fxToBaseByTicker: ReadonlyMap<string, number | null>,
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
  const fxMissingTickers: string[] = [];
  const rawHoldings: Array<{ ticker: string; shares: number; marketValue: number }> = [];
  let equityValue = 0;
  for (const [ticker, pos] of byTicker) {
    if (pos.shares <= 1e-6) continue;
    const fx = fxToBaseByTicker.get(ticker);
    if (fx === null || fx === undefined || !(fx > 0)) {
      fxMissingTickers.push(ticker);
      continue;
    }
    const latestClose = latestCloseByTicker.get(ticker);
    const mv = latestClose !== undefined ? pos.shares * latestClose * fx : pos.costValue;
    if (latestClose === undefined) missingPriceTickers.push(ticker);
    equityValue += mv;
    rawHoldings.push({ ticker, shares: pos.shares, marketValue: mv });
  }
  return { rawHoldings, equityValue, missingPriceTickers, fxMissingTickers };
}

function resolveTickerFxToBase(params: {
  transactions: readonly ReplayTxInput[];
  baseCurrency: CurrencyCode;
  fxRatesByCurrency: ReadonlyMap<string, readonly DailyFxRatePoint[]>;
  asOfDate: string;
}): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const tx of params.transactions) {
    if (tx.action !== "buy") continue;
    const ticker = tx.ticker.trim().toUpperCase();
    const currency = tx.tradeCurrency ?? inferCurrencyFromTicker(ticker);
    out.set(
      ticker,
      currency
        ? resolveCrossFxRateOnDate(
            currency,
            params.baseCurrency,
            params.asOfDate,
            params.fxRatesByCurrency,
          )
        : null,
    );
  }
  return out;
}

/**
 * Computes real split-basis NAV weights (`w_i = q̃_i * P̃_{i,T} / NAV_T`, `w_cash = cash_T / NAV_T`)
 * directly from a tenant's own ledger transactions, marked into the account base currency at the as-of
 * ECB cross rate; holdings with no rate land in `fxMissingTickers` instead of a fabricated 1:1 (U0-9 / V0-3).
 */
export function computeLedgerPortfolioWeights(params: {
  transactions: readonly ReplayTxInput[];
  splitsByTicker: ReadonlyMap<string, readonly SplitActionInput[]>;
  latestCloseByTicker: ReadonlyMap<string, number>;
  baseCurrency: CurrencyCode;
  fxRatesByCurrency: ReadonlyMap<string, readonly DailyFxRatePoint[]>;
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
  if (!replayed.ok) return emptyWeights(0, [], []);
  const agg = aggregateOpenLots(
    replayed.openLots,
    params.latestCloseByTicker,
    resolveTickerFxToBase(params),
  );
  return toWeights(agg, Math.max(0, replayed.cashBalance));
}

function emptyWeights(
  cashBalance: number,
  missingPriceTickers: string[],
  fxMissingTickers: string[],
): LedgerPortfolioWeights {
  return {
    totalNav: 0,
    cashBalance: roundTo(cashBalance, 2),
    cashWeightPct: 0,
    holdings: [],
    missingPriceTickers,
    fxMissingTickers,
  };
}

function toWeights(
  agg: ReturnType<typeof aggregateOpenLots>,
  cashBalance: number,
): LedgerPortfolioWeights {
  const totalNav = cashBalance + agg.equityValue;
  if (totalNav <= 1e-6) {
    return emptyWeights(cashBalance, agg.missingPriceTickers, agg.fxMissingTickers);
  }
  const holdings = agg.rawHoldings
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
    missingPriceTickers: agg.missingPriceTickers,
    fxMissingTickers: agg.fxMissingTickers,
  };
}
