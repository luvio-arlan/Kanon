"use client";

import type { LedgerTransactionRow } from "@kanon/core";
import { Button, cn, formatMoney } from "@kanon/ui";
import { useState } from "react";

const ACTION_LABEL: Record<LedgerTransactionRow["action"], string> = {
  buy: "买入",
  sell: "卖出",
  dividend: "股息",
  deposit: "入金",
  withdraw: "出金",
};

function describeAmount(row: LedgerTransactionRow, baseCurrency: string): string {
  const currency = row.tradeCurrency ?? baseCurrency;
  if (row.action === "buy" || row.action === "sell") {
    return `${row.quantity} @ ${formatMoney(row.price, currency)}`;
  }
  return formatMoney(row.quantity * row.price, currency);
}

function TxHistoryRow({
  row,
  reversed,
  baseCurrency,
  confirming,
  busy,
  onClick,
}: {
  row: LedgerTransactionRow;
  reversed: boolean;
  baseCurrency: string;
  confirming: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <span
        className={cn(
          "min-w-0 truncate font-mono tabular-nums",
          reversed ? "text-ink-muted line-through" : "text-ink-secondary",
        )}
      >
        {row.tradeDate} · {ACTION_LABEL[row.action]} {row.ticker === "CASH" ? "" : `${row.ticker} `}
        {describeAmount(row, baseCurrency)}
      </span>
      {reversed ? null : (
        <Button variant="ghost" size="xs" loading={busy && confirming} onClick={onClick}>
          <span>{confirming ? "确认冲销" : "冲销"}</span>
        </Button>
      )}
    </div>
  );
}

/** Recent ledger rows with an append-only reversal action (original rows are never edited — U1-1). */
export function LedgerTxHistory({
  transactions,
  baseCurrency,
  busy,
  onReverse,
}: {
  transactions: readonly LedgerTransactionRow[];
  baseCurrency: string;
  busy: boolean;
  onReverse: (transactionId: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const reversedIds = new Set(
    transactions.map((t) => t.reversesTxId).filter((id): id is string => Boolean(id)),
  );
  const rows = transactions.filter((t) => !t.reversesTxId);
  if (rows.length === 0) return null;
  return (
    <div className="divide-y divide-hairline rounded-panel border border-hairline bg-surface text-xs">
      {rows.map((row) => (
        <TxHistoryRow
          key={row.id}
          row={row}
          reversed={reversedIds.has(row.id)}
          baseCurrency={baseCurrency}
          confirming={confirmId === row.id}
          busy={busy}
          onClick={() => (confirmId === row.id ? onReverse(row.id) : setConfirmId(row.id))}
        />
      ))}
    </div>
  );
}
