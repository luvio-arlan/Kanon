"use client";

import { Button, formatMoney, Input } from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import type { LedgerAccountRow } from "../../lib/inbox-ledger-api";

export type LedgerTxPayload = {
  accountId: string;
  ticker: string;
  action: "deposit" | "buy" | "sell";
  quantity: number;
  price: number;
  tradeDate: string;
};

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

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

function validateTxDraft(
  accountId: string,
  form: {
    ticker: string;
    action: LedgerTxPayload["action"];
    qty: string;
    price: string;
    tradeDate: string;
  },
): { ok: true; payload: LedgerTxPayload } | { ok: false; error: string } {
  const qty = Number(form.qty);
  const isDeposit = form.action === "deposit";
  const price = isDeposit ? 1 : Number(form.price);
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "请输入大于 0 的数量或金额" };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "请输入大于 0 的成交价" };
  const ticker = isDeposit ? "CASH" : form.ticker.trim().toUpperCase();
  if (!ticker) return { ok: false, error: "请输入标的代码" };
  return {
    ok: true,
    payload: {
      accountId,
      ticker,
      action: form.action,
      quantity: qty,
      price,
      tradeDate: form.tradeDate || todayDateInput(),
    },
  };
}

function LedgerTxInputs({
  form,
  onPatch,
}: {
  form: {
    ticker: string;
    action: LedgerTxPayload["action"];
    qty: string;
    price: string;
    tradeDate: string;
  };
  onPatch: (
    patch: Partial<{ ticker: string; qty: string; price: string; tradeDate: string }>,
  ) => void;
}) {
  const isDeposit = form.action === "deposit";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {!isDeposit ? (
        <Input
          value={form.ticker}
          onChange={(e) => onPatch({ ticker: e.target.value.toUpperCase() })}
          placeholder="代码"
        />
      ) : null}
      <Input
        type="number"
        value={form.qty}
        onChange={(e) => onPatch({ qty: e.target.value })}
        placeholder={isDeposit ? "入金金额" : "数量"}
      />
      {!isDeposit ? (
        <Input
          type="number"
          value={form.price}
          onChange={(e) => onPatch({ price: e.target.value })}
          placeholder="成交价"
        />
      ) : null}
      <Input
        type="date"
        value={form.tradeDate}
        max={todayDateInput()}
        onChange={(e) => onPatch({ tradeDate: e.target.value })}
      />
    </div>
  );
}

export function LedgerTxForm({
  accountId,
  busy,
  onSubmit,
}: {
  accountId: string;
  busy: boolean;
  onSubmit: (p: LedgerTxPayload) => void;
}) {
  const [form, setForm] = useState({
    ticker: "",
    action: "buy" as LedgerTxPayload["action"],
    qty: "",
    price: "",
    tradeDate: todayDateInput(),
  });
  const submit = () => {
    const validated = validateTxDraft(accountId, form);
    if (!validated.ok) return void toast.error(validated.error);
    onSubmit(validated.payload);
  };
  return (
    <div className="space-y-2.5 rounded-panel border border-hairline bg-surface p-4">
      <div className="flex gap-1.5">
        {(["buy", "sell", "deposit"] as const).map((act) => (
          <Button
            key={act}
            variant={form.action === act ? "primary" : "outline"}
            size="sm"
            onClick={() => setForm((p) => ({ ...p, action: act }))}
          >
            <span>{act === "buy" ? "买入" : act === "sell" ? "卖出" : "入金"}</span>
          </Button>
        ))}
      </div>
      <LedgerTxInputs form={form} onPatch={(patch) => setForm((p) => ({ ...p, ...patch }))} />
      <Button variant="primary" size="sm" loading={busy} onClick={submit}>
        <span>登记成交</span>
      </Button>
    </div>
  );
}

export function EmptyLedgerState({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (initialCash: number, confirmed: boolean) => void;
}) {
  const [cashText, setCashText] = useState("0");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="space-y-4 rounded-panel border border-hairline bg-surface p-5 text-xs">
      <div className="space-y-1.5">
        <div className="font-medium text-ink-primary">初始化账户</div>
        <Input
          type="number"
          min="0"
          value={cashText}
          onChange={(e) => setCashText(e.target.value)}
          placeholder="初始现金 (USD，默认 0)"
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
          onCreate(parsed, confirmed);
        }}
      >
        <IconPlus size={14} stroke={1.5} />
        <span>创建账本</span>
      </Button>
    </div>
  );
}
