"use client";

import { inferCurrencyFromTicker } from "@kanon/core";
import { Button, Input } from "@kanon/ui";
import { useState } from "react";
import { toast } from "sonner";
import type { LedgerMutationResult, LedgerTxInput } from "../../lib/inbox-ledger-api";

type LedgerAction = LedgerTxInput["action"];

const ACTION_LABELS: ReadonlyArray<[LedgerAction, string]> = [
  ["buy", "买入"],
  ["sell", "卖出"],
  ["dividend", "股息"],
  ["deposit", "入金"],
  ["withdraw", "出金"],
];

const CASH_ACTIONS = new Set<LedgerAction>(["deposit", "withdraw"]);
const AMOUNT_ACTIONS = new Set<LedgerAction>(["deposit", "withdraw", "dividend"]);

interface TxDraft {
  action: LedgerAction;
  ticker: string;
  qty: string;
  price: string;
  fees: string;
  fx: string;
  tradeDate: string;
}

export interface LedgerThesisRef {
  id: string;
  ticker: string;
}

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseOptionalPositive(raw: string): number | undefined | null {
  if (!raw.trim()) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function validateDraftNumbers(
  draft: TxDraft,
): { qty: number; price: number; fees: number; fx: number | undefined } | string {
  const qty = Number(draft.qty);
  const price = AMOUNT_ACTIONS.has(draft.action) ? 1 : Number(draft.price);
  const fees = draft.fees.trim() ? Number(draft.fees) : 0;
  const fx = parseOptionalPositive(draft.fx);
  if (!Number.isFinite(qty) || qty <= 0) return "请输入大于 0 的数量或金额";
  if (!Number.isFinite(price) || price <= 0) return "请输入大于 0 的成交价";
  if (!Number.isFinite(fees) || fees < 0) return "手续费不能为负数";
  if (fx === null) return "汇率必须大于 0";
  return { qty, price, fees, fx };
}

function buildPayload(
  accountId: string,
  draft: TxDraft,
  thesisId: string | null,
): { ok: true; payload: LedgerTxInput } | { ok: false; error: string } {
  const nums = validateDraftNumbers(draft);
  if (typeof nums === "string") return { ok: false, error: nums };
  const ticker = CASH_ACTIONS.has(draft.action) ? "CASH" : draft.ticker.trim().toUpperCase();
  if (!ticker) return { ok: false, error: "请输入标的代码" };
  return {
    ok: true,
    payload: {
      accountId,
      ticker,
      action: draft.action,
      quantity: nums.qty,
      price: nums.price,
      fees: nums.fees,
      tradeDate: draft.tradeDate || todayDateInput(),
      thesisId: ticker === "CASH" ? null : thesisId,
      ...(nums.fx !== undefined ? { fxToBase: nums.fx } : {}),
    },
  };
}

function NumberField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

/** Trade currency when it differs from the account base (the only case needing a broker FX field). */
function foreignTradeCurrency(draft: TxDraft, baseCurrency: string): string | null {
  if (CASH_ACTIONS.has(draft.action)) return null;
  const c = inferCurrencyFromTicker(draft.ticker.trim());
  return c && c !== baseCurrency ? c : null;
}

function TxInputs({
  draft,
  baseCurrency,
  onPatch,
}: {
  draft: TxDraft;
  baseCurrency: string;
  onPatch: (patch: Partial<TxDraft>) => void;
}) {
  const isCash = CASH_ACTIONS.has(draft.action);
  const isAmount = AMOUNT_ACTIONS.has(draft.action);
  const fxCurrency = foreignTradeCurrency(draft, baseCurrency);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {!isCash ? (
        <Input
          value={draft.ticker}
          onChange={(e) => onPatch({ ticker: e.target.value.toUpperCase() })}
          placeholder="代码"
        />
      ) : null}
      <NumberField
        value={draft.qty}
        placeholder={isAmount ? "金额" : "数量"}
        onChange={(qty) => onPatch({ qty })}
      />
      {!isAmount ? (
        <NumberField
          value={draft.price}
          placeholder="成交价"
          onChange={(price) => onPatch({ price })}
        />
      ) : null}
      <NumberField value={draft.fees} placeholder="手续费" onChange={(fees) => onPatch({ fees })} />
      {fxCurrency ? (
        <NumberField
          value={draft.fx}
          placeholder={`${fxCurrency}/${baseCurrency} · 留空取 ECB`}
          onChange={(fx) => onPatch({ fx })}
        />
      ) : null}
      <Input
        type="date"
        value={draft.tradeDate}
        max={todayDateInput()}
        onChange={(e) => onPatch({ tradeDate: e.target.value })}
      />
    </div>
  );
}

function ActionBar({
  value,
  onChange,
}: {
  value: LedgerAction;
  onChange: (a: LedgerAction) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ACTION_LABELS.map(([act, label]) => (
        <Button
          key={act}
          variant={value === act ? "primary" : "outline"}
          size="sm"
          onClick={() => onChange(act)}
        >
          <span>{label}</span>
        </Button>
      ))}
    </div>
  );
}

const EMPTY_DRAFT: TxDraft = {
  action: "buy",
  ticker: "",
  qty: "",
  price: "",
  fees: "",
  fx: "",
  tradeDate: "",
};

export function LedgerTxForm({
  accountId,
  baseCurrency,
  theses,
  busy,
  onSubmit,
}: {
  accountId: string;
  baseCurrency: string;
  theses: readonly LedgerThesisRef[];
  busy: boolean;
  onSubmit: (p: LedgerTxInput) => Promise<LedgerMutationResult>;
}) {
  const [draft, setDraft] = useState<TxDraft>({ ...EMPTY_DRAFT, tradeDate: todayDateInput() });
  const [pendingDeviation, setPendingDeviation] = useState<LedgerTxInput | null>(null);
  const linked = theses.find((t) => t.ticker.toUpperCase() === draft.ticker.trim().toUpperCase());
  const patch = (p: Partial<TxDraft>) => {
    setPendingDeviation(null);
    setDraft((d) => ({ ...d, ...p }));
  };
  const send = async (payload: LedgerTxInput) => {
    const res = await onSubmit(payload);
    if (!res.ok && res.code === "FX_DEVIATION") return void setPendingDeviation(payload);
    if (!res.ok) toast.error(res.error);
  };
  const submit = () => {
    const built = buildPayload(accountId, draft, linked?.id ?? null);
    if (!built.ok) return void toast.error(built.error);
    void send(built.payload);
  };
  return (
    <div className="space-y-2.5 rounded-panel border border-hairline bg-surface p-4">
      <ActionBar value={draft.action} onChange={(action) => patch({ action })} />
      <TxInputs draft={draft} baseCurrency={baseCurrency} onPatch={patch} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-ink-muted">{linked ? `关联档案 · ${linked.ticker}` : ""}</span>
        <Button
          variant={pendingDeviation ? "outline" : "primary"}
          size="sm"
          loading={busy}
          onClick={() =>
            pendingDeviation ? void send({ ...pendingDeviation, fxDeviationAck: true }) : submit()
          }
        >
          <span>{pendingDeviation ? "汇率偏离 ECB 超 3% · 确认登记" : "登记成交"}</span>
        </Button>
      </div>
    </div>
  );
}
