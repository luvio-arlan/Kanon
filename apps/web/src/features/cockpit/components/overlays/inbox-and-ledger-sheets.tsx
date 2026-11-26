"use client";

import { Button, Input, Sheet } from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  apiCreateLedgerAccount,
  apiLoadPortfolioLedger,
  apiRecordLedgerTx,
  type LedgerAccountRow,
} from "../../lib/inbox-ledger-api";
import { ResearchInboxSheet } from "./inbox-sheet";

type TxPayload = {
  accountId: string;
  ticker: string;
  action: "deposit" | "buy" | "sell";
  quantity: number;
  price: number;
};

function LedgerPositionsList({ positions }: { positions: LedgerAccountRow["positions"] }) {
  if (positions.length === 0) return null;
  return (
    <div className="divide-y divide-hairline rounded-panel border border-hairline bg-surface text-xs">
      {positions.map((pos) => (
        <div key={pos.ticker} className="flex items-center justify-between px-4 py-2.5">
          <span className="font-mono font-semibold text-ink-primary">{pos.ticker}</span>
          <span className="font-mono text-ink-secondary tabular-nums">
            {pos.shares} 股 · 均价 ${pos.avgCostBasis.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function LedgerActionBar({
  action,
  onChange,
}: {
  action: "deposit" | "buy" | "sell";
  onChange: (a: "deposit" | "buy" | "sell") => void;
}) {
  return (
    <div className="flex gap-1.5">
      {(["buy", "sell", "deposit"] as const).map((act) => (
        <Button
          key={act}
          variant={action === act ? "primary" : "outline"}
          size="sm"
          onClick={() => onChange(act)}
        >
          <span>{act === "buy" ? "买入" : act === "sell" ? "卖出" : "入金"}</span>
        </Button>
      ))}
    </div>
  );
}

function LedgerTxInputs({
  ticker,
  qty,
  price,
  onPatch,
}: {
  ticker: string;
  qty: string;
  price: string;
  onPatch: (patch: Partial<{ ticker: string; qty: string; price: string }>) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Input
        value={ticker}
        onChange={(e) => onPatch({ ticker: e.target.value.toUpperCase() })}
        placeholder="代码"
      />
      <Input
        type="number"
        value={qty}
        onChange={(e) => onPatch({ qty: e.target.value })}
        placeholder="数量"
      />
      <Input
        type="number"
        value={price}
        onChange={(e) => onPatch({ price: e.target.value })}
        placeholder="成交价"
      />
    </div>
  );
}

function LedgerTxForm({
  accountId,
  busy,
  onSubmit,
}: {
  accountId: string;
  busy: boolean;
  onSubmit: (p: TxPayload) => void;
}) {
  const [form, setForm] = useState({
    ticker: "NVDA",
    action: "buy" as TxPayload["action"],
    qty: "10",
    price: "120",
  });
  const submit = () =>
    onSubmit({
      accountId,
      ticker: form.action === "deposit" ? "CASH" : form.ticker,
      action: form.action,
      quantity: Number(form.qty) || 0,
      price: Number(form.price) || 0,
    });
  return (
    <div className="space-y-2.5 rounded-panel border border-hairline bg-surface p-4">
      <LedgerActionBar
        action={form.action}
        onChange={(action) => setForm((p) => ({ ...p, action }))}
      />
      <LedgerTxInputs
        ticker={form.ticker}
        qty={form.qty}
        price={form.price}
        onPatch={(patch) => setForm((p) => ({ ...p, ...patch }))}
      />
      <Button variant="primary" size="sm" loading={busy} onClick={submit}>
        <span>登记成交（零杠杆校验）</span>
      </Button>
    </div>
  );
}

function EmptyLedgerState({ busy, onCreate }: { busy: boolean; onCreate: () => void }) {
  return (
    <div className="space-y-3 py-8 text-center">
      <p className="text-xs text-ink-secondary">尚未初始化实盘账本（严格禁止融资与做空）。</p>
      <Button variant="primary" size="sm" loading={busy} onClick={onCreate}>
        <IconPlus size={14} stroke={1.5} />
        <span>初始化主账本 ($100,000)</span>
      </Button>
    </div>
  );
}

function PortfolioLedgerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [accounts, setAccounts] = useState<LedgerAccountRow[]>([]);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => {
    if (open) void apiLoadPortfolioLedger().then(setAccounts);
  }, [open]);
  useEffect(() => reload(), [reload]);

  const active = accounts[0];
  const handleCreate = async () => {
    setBusy(true);
    const ok = await apiCreateLedgerAccount("零杠杆主账本", 100_000);
    setBusy(false);
    if (ok) {
      toast.success("已创建零杠杆实盘账本（初始现金 $100,000）");
      reload();
    }
  };
  const handleTx = async (p: TxPayload) => {
    setBusy(true);
    const res = await apiRecordLedgerTx(p);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("已登记零杠杆 FIFO 成交");
    reload();
  };
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title="零杠杆实盘 FIFO 账本" size="md">
      {!active ? (
        <EmptyLedgerState busy={busy} onCreate={() => void handleCreate()} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-panel border border-hairline bg-canvas/50 px-4 py-3 text-xs">
            <span className="font-semibold text-ink-primary">{active.name}</span>
            <span className="font-mono text-sm font-semibold text-ink-primary tabular-nums">
              可用现金 ${active.cashBalance.toLocaleString()}
            </span>
          </div>
          <LedgerTxForm accountId={active.id} busy={busy} onSubmit={(p) => void handleTx(p)} />
          <LedgerPositionsList positions={active.positions} />
        </div>
      )}
    </Sheet>
  );
}

export function CockpitWorkflowSheets({
  inboxOpen,
  ledgerOpen,
  onCloseInbox,
  onCloseLedger,
}: {
  inboxOpen: boolean;
  ledgerOpen: boolean;
  onCloseInbox: () => void;
  onCloseLedger: () => void;
}) {
  return (
    <>
      <ResearchInboxSheet open={inboxOpen} onClose={onCloseInbox} />
      <PortfolioLedgerSheet open={ledgerOpen} onClose={onCloseLedger} />
    </>
  );
}
