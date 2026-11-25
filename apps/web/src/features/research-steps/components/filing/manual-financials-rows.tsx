"use client";

import type { ReportingCurrency } from "@kanon/core";
import { ActionMenu, Input } from "@kanon/ui";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";
import { CURRENCIES, type ManualRowDraft } from "./manual-financials-helpers";

const NUM_COLS: ReadonlyArray<{
  key: Exclude<keyof ManualRowDraft, "id" | "fiscalYear" | "eps">;
  step: number;
}> = [
  { key: "revenueB", step: 0.1 },
  { key: "grossMarginPct", step: 0.5 },
  { key: "netIncomeB", step: 0.1 },
  { key: "fcfB", step: 0.1 },
];

function CurrencyPicker({
  currency,
  onCurrency,
}: {
  currency: ReportingCurrency;
  onCurrency: (c: ReportingCurrency) => void;
}) {
  return (
    <ActionMenu
      ariaLabel="选择报表币种"
      triggerClassName="inline-flex h-8 w-full items-center justify-between gap-1 rounded-control border border-hairline bg-surface px-3 font-mono text-xs text-ink-primary hover:border-strong"
      trigger={
        <>
          <span>{currency}</span>
          <IconChevronDown size={13} stroke={1.5} className="kanon-chevron text-ink-muted" />
        </>
      }
      items={CURRENCIES.map((c) => ({
        id: c,
        label: c,
        selected: currency === c,
        onSelect: () => onCurrency(c),
      }))}
    />
  );
}

export function CurrencyControlsRow(p: {
  currency: ReportingCurrency;
  fxToUsd: string;
  adrRatio: string;
  onCurrency: (c: ReportingCurrency) => void;
  onFx: (v: string) => void;
  onAdr: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-hairline pb-4">
      <div className="space-y-1">
        <span className="text-xs text-ink-muted">报表币种</span>
        <CurrencyPicker currency={p.currency} onCurrency={p.onCurrency} />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-ink-muted">对 USD 汇率</span>
        <Input
          type="number"
          step={0.001}
          value={p.fxToUsd}
          onChange={(e) => p.onFx(e.target.value)}
          className="h-8 font-mono text-xs tabular-nums"
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-ink-muted">ADR 换股比</span>
        <Input
          type="number"
          step={1}
          value={p.adrRatio}
          onChange={(e) => p.onAdr(e.target.value)}
          className="h-8 font-mono text-xs tabular-nums"
        />
      </div>
    </div>
  );
}

function ManualAnnualRowEditor({
  row,
  canDelete,
  onPatch,
  onDelete,
}: {
  row: ManualRowDraft;
  canDelete: boolean;
  onPatch: (p: Partial<ManualRowDraft>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid grid-cols-12 items-center gap-2">
      <Input
        value={row.fiscalYear}
        onChange={(e) => onPatch({ fiscalYear: e.target.value })}
        className="col-span-2 h-8 font-mono text-xs"
      />
      {NUM_COLS.map((c) => (
        <Input
          key={c.key}
          type="number"
          step={c.step}
          value={row[c.key]}
          onChange={(e) => onPatch({ [c.key]: e.target.value })}
          className="col-span-2 h-8 font-mono text-xs"
        />
      ))}
      <div className="col-span-2 flex items-center gap-1">
        <Input
          type="number"
          step={0.1}
          value={row.eps}
          onChange={(e) => onPatch({ eps: e.target.value })}
          className="h-8 font-mono text-xs"
        />
        {canDelete ? (
          <button
            type="button"
            aria-label={`删除 ${row.fiscalYear || "当前"} 财年记录`}
            onClick={onDelete}
            className="cursor-pointer text-ink-muted hover:text-status-fail"
          >
            <IconTrash size={13} stroke={1.5} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ManualRowsSection(p: {
  rows: readonly ManualRowDraft[];
  onPatch: (id: string, patch: Partial<ManualRowDraft>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-12 gap-2 text-xs text-ink-muted">
        <span className="col-span-2">财年</span>
        <span className="col-span-2">营收(十亿)</span>
        <span className="col-span-2">毛利%</span>
        <span className="col-span-2">净利(十亿)</span>
        <span className="col-span-2">FCF(十亿)</span>
        <span className="col-span-2">EPS</span>
      </div>
      {p.rows.map((row) => (
        <ManualAnnualRowEditor
          key={row.id}
          row={row}
          canDelete={p.rows.length > 1}
          onPatch={(patch) => p.onPatch(row.id, patch)}
          onDelete={() => p.onDelete(row.id)}
        />
      ))}
    </div>
  );
}
