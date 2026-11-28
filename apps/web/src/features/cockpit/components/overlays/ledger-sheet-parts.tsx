"use client";

import type { CurrencyCode } from "@kanon/core";
import { Button, formatMoney, Input } from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import type { LedgerAccountRow } from "../../lib/inbox-ledger-api";

export function LedgerPositionsList({
  positions,
  currency = "USD",
}: {
  positions: LedgerAccountRow["positions"];
  currency?: string;
}) {
  if (positions.length === 0) return null;
  return (
    <div className="divide-y divide-hairline rounded-panel border border-hairline bg-surface text-xs">
      {positions.map((pos) => (
        <div key={pos.ticker} className="flex items-center justify-between px-4 py-2.5">
          <span className="font-mono font-semibold text-ink-primary">{pos.ticker}</span>
          <span className="font-mono text-ink-secondary tabular-nums">
            {pos.shares} 股 · 均价 {formatMoney(pos.avgCostBasis, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

const ACCOUNT_CURRENCIES = ["USD", "HKD", "CNY"] as const satisfies readonly CurrencyCode[];

function CurrencyPicker({
  value,
  onChange,
}: {
  value: CurrencyCode;
  onChange: (c: CurrencyCode) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {ACCOUNT_CURRENCIES.map((c) => (
        <Button
          key={c}
          variant={value === c ? "primary" : "outline"}
          size="sm"
          onClick={() => onChange(c)}
        >
          <span>{c}</span>
        </Button>
      ))}
    </div>
  );
}

export function EmptyLedgerState({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (initialCash: number, confirmed: boolean, baseCurrency: CurrencyCode) => void;
}) {
  const [cashText, setCashText] = useState("0");
  const [confirmed, setConfirmed] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>("USD");

  return (
    <div className="space-y-4 rounded-panel border border-hairline bg-surface p-5 text-xs">
      <div className="space-y-1.5">
        <div className="font-medium text-ink-primary">初始化账户</div>
        <CurrencyPicker value={baseCurrency} onChange={setBaseCurrency} />
        <Input
          type="number"
          min="0"
          value={cashText}
          onChange={(e) => setCashText(e.target.value)}
          placeholder={`初始现金 (${baseCurrency})`}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-ink-secondary">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>本账户不使用融资与做空</span>
      </label>
      <Button
        variant="primary"
        size="sm"
        loading={busy}
        disabled={!confirmed}
        onClick={() => {
          const parsed = Number(cashText || "0");
          if (!Number.isFinite(parsed) || parsed < 0) return void toast.error("初始现金不能为负数");
          onCreate(parsed, confirmed, baseCurrency);
        }}
      >
        <IconPlus size={14} stroke={1.5} />
        <span>创建账本</span>
      </Button>
    </div>
  );
}
