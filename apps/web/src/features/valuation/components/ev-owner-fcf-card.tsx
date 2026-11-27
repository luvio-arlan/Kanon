"use client";

import {
  calculateEvOwnerFcfValuation,
  type EvOwnerFcfResult,
  type ValuationDriverInputs,
} from "@kanon/core";
import { Badge, Button, Card, Input } from "@kanon/ui";
import { IconArrowDownRight } from "@tabler/icons-react";
import { useState } from "react";

export function DriverNumInput(props: {
  label: string;
  value: number | null;
  step?: number;
  placeholder?: string;
  onChange: (v: number) => void;
}) {
  const inputId = `val-drv-${props.label}`;
  const [editing, setEditing] = useState(false);
  const formatted = props.value == null ? "" : String(props.value);
  const [raw, setRaw] = useState(formatted);
  const displayed = editing ? raw : formatted;

  const handleChange = (text: string) => {
    setRaw(text);
    const trimmed = text.trim();
    if (!trimmed || trimmed === "-" || trimmed === "." || trimmed === "-.") return;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) props.onChange(parsed);
  };

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-xs text-ink-muted">
        {props.label}
      </label>
      <Input
        id={inputId}
        type="number"
        step={props.step ?? 0.5}
        placeholder={props.placeholder ?? "待填"}
        value={displayed}
        onFocus={() => {
          setRaw(formatted);
          setEditing(true);
        }}
        onBlur={() => setEditing(false)}
        onChange={(e) => handleChange(e.target.value)}
        className="font-mono tabular-nums"
      />
    </div>
  );
}

function EvSummaryGrid({ ev }: { ev: EvOwnerFcfResult }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-t border-hairline pt-3.5 font-mono text-xs tabular-nums">
      <div>
        <div className="font-sans text-ink-muted">EV 悲观锚</div>
        <div className="mt-0.5 text-sm font-semibold text-ink-secondary">
          ${ev.bearTargetPrice.toFixed(1)}
        </div>
      </div>
      <div>
        <div className="font-sans text-ink-muted">EV 中性目标</div>
        <div className="mt-0.5 text-sm font-semibold text-ink-primary">
          ${ev.baseTargetPrice.toFixed(1)} ({ev.baseUpsidePct > 0 ? "+" : ""}
          {ev.baseUpsidePct}%)
        </div>
      </div>
      <div>
        <div className="font-sans text-ink-muted">EV 乐观 / 赔率</div>
        <div className="mt-0.5 text-sm font-semibold text-status-pass">
          ${ev.bullTargetPrice.toFixed(1)} ·{" "}
          {ev.riskRewardRatio !== null ? `${ev.riskRewardRatio}×` : "∞"}
        </div>
      </div>
    </div>
  );
}

interface EvValues {
  baseFcfB: number | null;
  baseMult: number | null;
  cashB: number | null;
  debtB: number | null;
}

function EvInputsGrid({
  f,
  onPatch,
}: {
  f: EvValues;
  onPatch: (p: Partial<ValuationDriverInputs>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <DriverNumInput
        label="中性远期 Owner FCF ($B)"
        value={f.baseFcfB}
        onChange={(baseOwnerFcfB) => onPatch({ baseOwnerFcfB })}
      />
      <DriverNumInput
        label="合理 EV/FCF 倍数 (×)"
        value={f.baseMult}
        step={1}
        onChange={(ownerFcfMultipleBase) => onPatch({ ownerFcfMultipleBase })}
      />
      <DriverNumInput
        label="账面现金 ($B)"
        value={f.cashB}
        onChange={(cashB) => onPatch({ cashB })}
      />
      <DriverNumInput
        label="总有息负债 ($B)"
        value={f.debtB}
        onChange={(totalDebtB) => onPatch({ totalDebtB })}
      />
    </div>
  );
}

function buildEvInputs(props: {
  driverInputs: ValuationDriverInputs;
  initialFcfB: number | null;
  initialCashB: number | null;
  initialDebtB: number | null;
}): EvValues {
  return {
    baseFcfB: props.driverInputs.baseOwnerFcfB ?? props.initialFcfB,
    baseMult: props.driverInputs.ownerFcfMultipleBase ?? null,
    cashB: props.driverInputs.cashB ?? props.initialCashB,
    debtB: props.driverInputs.totalDebtB ?? props.initialDebtB,
  };
}

function EvApplyFooter({
  ev,
  onApply,
}: {
  ev: EvOwnerFcfResult | null;
  onApply: (targets: { bear: number; base: number; bull: number }) => void;
}) {
  const canApply =
    ev !== null && ev.bearTargetPrice > 0 && ev.baseTargetPrice > 0 && ev.bullTargetPrice > 0;
  return (
    <div className="flex justify-end border-t border-hairline pt-3">
      <Button
        variant="titanium"
        size="sm"
        disabled={!canApply}
        onClick={() => {
          if (!canApply || !ev) return;
          onApply({
            bear: ev.bearTargetPrice,
            base: ev.baseTargetPrice,
            bull: ev.bullTargetPrice,
          });
        }}
      >
        <IconArrowDownRight size={14} stroke={1.5} />
        <span>按 EV/FCF 锚定三情景</span>
      </Button>
    </div>
  );
}

export function EvOwnerFcfCard(props: {
  currentPrice: number;
  horizonYears: number;
  sharesM: number;
  initialFcfB: number | null;
  initialCashB: number | null;
  initialDebtB: number | null;
  driverInputs: ValuationDriverInputs;
  onPatchDrivers: (next: Partial<ValuationDriverInputs>) => void;
  onApplyEvTargets?: (targets: { bear: number; base: number; bull: number }) => void;
}) {
  const f = buildEvInputs(props);
  const ev =
    f.baseFcfB !== null && f.baseMult !== null && f.baseFcfB > 0 && f.baseMult > 0
      ? calculateEvOwnerFcfValuation({
          currentPrice: props.currentPrice,
          dilutedSharesM: props.sharesM,
          cashB: f.cashB ?? 0,
          totalDebtB: f.debtB ?? 0,
          bearOwnerFcfB: Number((f.baseFcfB * 0.72).toFixed(2)),
          baseOwnerFcfB: f.baseFcfB,
          bullOwnerFcfB: Number((f.baseFcfB * 1.32).toFixed(2)),
          bearEvMultiple: Math.max(8, f.baseMult - 5),
          baseEvMultiple: f.baseMult,
          bullEvMultiple: f.baseMult + 5,
          horizonYears: props.horizonYears,
        })
      : null;
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-primary">EV / Owner FCF 企业价值交叉锚</h3>
        {ev ? (
          <Badge variant="default" className="font-mono tabular-nums">
            EV ${ev.currentEvB}B
          </Badge>
        ) : null}
      </div>
      <EvInputsGrid f={f} onPatch={props.onPatchDrivers} />
      {ev ? (
        <EvSummaryGrid ev={ev} />
      ) : (
        <p className="border-t border-hairline pt-3 text-xs text-ink-muted">
          请填写正数 Owner FCF 与 EV/FCF 倍数后计算目标价。
        </p>
      )}
      {props.onApplyEvTargets ? <EvApplyFooter ev={ev} onApply={props.onApplyEvTargets} /> : null}
    </Card>
  );
}
