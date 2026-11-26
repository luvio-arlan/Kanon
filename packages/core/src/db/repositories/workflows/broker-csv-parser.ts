import type { LedgerAction } from "../../schema";

export interface ParsedBrokerCsvRow {
  tradeDate: string;
  ticker: string;
  action: LedgerAction;
  quantity: number;
  price: number;
  fees: number;
}

const VALID_CSV_ACTIONS = new Set<LedgerAction>(["deposit", "withdraw", "buy", "sell", "dividend"]);

/** Parses standard broker CSV rows (`date,ticker,action,quantity,price,fees`). */
export function parseBrokerCsvTransactions(csvText: string): ParsedBrokerCsvRow[] {
  const out: ParsedBrokerCsvRow[] = [];
  for (const line of csvText.split(/\r?\n/).slice(1)) {
    const [tradeDate = "", rawTicker = "CASH", rawAct = "", rawQty, rawPx, rawFee] = line
      .split(",")
      .map((c) => c.trim());
    const action = rawAct.toLowerCase() as LedgerAction;
    const quantity = Number(rawQty);
    const price = Number(rawPx);
    if (!VALID_CSV_ACTIONS.has(action) || !Number.isFinite(quantity) || !Number.isFinite(price)) {
      continue;
    }
    const fees = Number(rawFee ?? 0);
    out.push({
      tradeDate,
      ticker: rawTicker.toUpperCase(),
      action,
      quantity,
      price,
      fees: Number.isFinite(fees) ? fees : 0,
    });
  }
  return out;
}
