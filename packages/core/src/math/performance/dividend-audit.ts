import type { UnrecordedDividend } from "../../contracts/analytics";
import { roundTo } from "../valuation-scenarios";
import type { CashDividendEvent } from "./benchmark-tr";
import type { ReplayTxInput } from "./ledger-replay";

/** Detects corporate-action cash dividends where the account held shares on ex-date without a matching dividend tx (S1). */
export function detectUnrecordedDividends(params: {
  transactions: readonly ReplayTxInput[];
  dividendsByTicker: ReadonlyMap<string, readonly CashDividendEvent[]>;
  sharesAtDate: ReadonlyMap<string, ReadonlyMap<string, number>>;
}): UnrecordedDividend[] {
  const divTxs = params.transactions.filter((t) => t.action === "dividend");
  const out: UnrecordedDividend[] = [];
  for (const [ticker, divs] of params.dividendsByTicker) {
    for (const d of divs) {
      const shares = params.sharesAtDate.get(d.exDate)?.get(ticker) ?? 0;
      if (shares <= 1e-6) continue;
      const exMs = Date.parse(`${d.exDate}T00:00:00Z`);
      const matched = divTxs.some((tx) => {
        if (tx.ticker.toUpperCase() !== ticker) return false;
        const diffDays = (Date.parse(`${tx.tradeDate}T00:00:00Z`) - exMs) / 86_400_000;
        return diffDays >= -2 && diffDays <= 14;
      });
      if (!matched) {
        out.push({
          ticker,
          exDate: d.exDate,
          perShare: roundTo(d.amount, 4),
          sharesOnExDate: roundTo(shares, 4),
          estimatedTotal: roundTo(shares * d.amount, 2),
        });
      }
    }
  }
  return out.sort((a, b) => b.exDate.localeCompare(a.exDate)).slice(0, 20);
}
