"use client";

import type { ReportingCurrency, SecAnnualFinancial, SecSnapshot } from "@kanon/core";
import { Button, Sheet } from "@kanon/ui";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { apiSaveManualSecSnapshot } from "../../lib/notes-api";
import {
  CURRENCY_FX,
  createDefaultManualRows,
  createEmptyManualRow,
  type ManualRowDraft,
  parseManualRowToAnnual,
  toManualRowDraft,
} from "./manual-financials-helpers";
import { CurrencyControlsRow, ManualRowsSection } from "./manual-financials-rows";

interface ManualSheetProps {
  open: boolean;
  ticker: string;
  companyName: string;
  snapshot: SecSnapshot | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (next: SecSnapshot) => void;
}

async function persistManualRows(params: {
  ticker: string;
  companyName: string;
  currency: ReportingCurrency;
  fxToUsd: string;
  adrRatio: string;
  rows: readonly ManualRowDraft[];
}) {
  const fx = Math.max(0.0001, Number(params.fxToUsd) || 1);
  const adr = Math.max(0.1, Number(params.adrRatio) || 1);
  const annuals = params.rows
    .map((r) => parseManualRowToAnnual(r, fx, adr))
    .filter((r): r is SecAnnualFinancial => r !== null);
  if (annuals.length === 0) return null;
  return apiSaveManualSecSnapshot(params.ticker, {
    entityName: params.companyName,
    reportingCurrency: params.currency,
    fxToUsd: fx,
    adrRatio: adr,
    annuals,
  });
}

function useManualSheetState(props: ManualSheetProps) {
  const [currency, setCurrency] = useState<ReportingCurrency>(
    (props.snapshot?.reportingCurrency as ReportingCurrency) || "USD",
  );
  const [fxToUsd, setFxToUsd] = useState(String(props.snapshot?.fxToUsd ?? 1));
  const [adrRatio, setAdrRatio] = useState(String(props.snapshot?.adrRatio ?? 1));
  const [rows, setRows] = useState<ManualRowDraft[]>(() =>
    props.snapshot?.annuals.length
      ? props.snapshot.annuals.map(toManualRowDraft)
      : createDefaultManualRows(),
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const saved = await persistManualRows({
      ticker: props.ticker,
      companyName: props.companyName,
      currency,
      fxToUsd,
      adrRatio,
      rows,
    }).finally(() => setSaving(false));
    if (!saved) return;
    props.onSaved(saved);
    props.onOpenChange(false);
  };
  const addRow = () => setRows((p) => [...p, createEmptyManualRow()]);
  return {
    currency,
    setCurrency,
    fxToUsd,
    setFxToUsd,
    adrRatio,
    setAdrRatio,
    rows,
    setRows,
    saving,
    submit,
    addRow,
  };
}

function ManualSheetFooter({
  saving,
  onAdd,
  onSubmit,
}: {
  saving: boolean;
  onAdd: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-hairline pt-4">
      <Button variant="outline" size="xs" onClick={onAdd}>
        <IconPlus size={13} stroke={1.5} />
        <span>新增财年</span>
      </Button>
      <Button variant="primary" size="sm" loading={saving} onClick={onSubmit}>
        <IconCheck size={14} stroke={1.5} />
        <span>保存并折算 USD</span>
      </Button>
    </div>
  );
}

export function ManualFinancialsSheet(props: ManualSheetProps) {
  const s = useManualSheetState(props);
  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`${props.ticker} · 全球财报录入`}
      size="lg"
    >
      <div className="space-y-5">
        <CurrencyControlsRow
          currency={s.currency}
          fxToUsd={s.fxToUsd}
          adrRatio={s.adrRatio}
          onCurrency={(c) => {
            s.setCurrency(c);
            s.setFxToUsd(String(CURRENCY_FX[c]));
          }}
          onFx={s.setFxToUsd}
          onAdr={s.setAdrRatio}
        />
        <ManualRowsSection
          rows={s.rows}
          onPatch={(id, patch) =>
            s.setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))
          }
          onDelete={(id) => s.setRows((p) => p.filter((r) => r.id !== id))}
        />
        <ManualSheetFooter saving={s.saving} onAdd={s.addRow} onSubmit={() => void s.submit()} />
      </div>
    </Sheet>
  );
}
