"use client";

import {
  calculateEvOwnerFcfValuation,
  type EvOwnerFcfResult,
  type ValuationDriverInputs,
} from "@kanon/core";
import { Badge, Card, Input } from "@kanon/ui";

export function DriverNumInput(props: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const inputId = `val-drv-${props.label}`;
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-xs text-ink-muted">
        {props.label}
      </label>
      <Input
        id={inputId}
        type="number"
        step={props.step ?? 0.5}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value) || 0)}
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
  baseFcfB: number;
  baseMult: number;
  cashB: number;
  debtB: number;
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

export function EvOwnerFcfCard(props: {
  currentPrice: number;
  horizonYears: number;
  sharesM: number;
  initialFcfB: number;
  initialCashB: number;
  initialDebtB: number;
  driverInputs: ValuationDriverInputs;
  onPatchDrivers: (next: Partial<ValuationDriverInputs>) => void;
}) {
  const f: EvValues = {
    baseFcfB: props.driverInputs.baseOwnerFcfB ?? props.initialFcfB,
    baseMult: props.driverInputs.ownerFcfMultipleBase ?? 20,
    cashB: props.driverInputs.cashB ?? props.initialCashB,
    debtB: props.driverInputs.totalDebtB ?? props.initialDebtB,
  };
  const ev = calculateEvOwnerFcfValuation({
    currentPrice: props.currentPrice,
    dilutedSharesM: props.sharesM,
    cashB: f.cashB,
    totalDebtB: f.debtB,
    bearOwnerFcfB: Number((f.baseFcfB * 0.72).toFixed(2)),
    baseOwnerFcfB: f.baseFcfB,
    bullOwnerFcfB: Number((f.baseFcfB * 1.32).toFixed(2)),
    bearEvMultiple: Math.max(8, f.baseMult - 5),
    baseEvMultiple: f.baseMult,
    bullEvMultiple: f.baseMult + 5,
    horizonYears: props.horizonYears,
  });
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-primary">EV / Owner FCF 企业价值交叉锚</h3>
        <Badge variant="default" className="font-mono tabular-nums">
          EV ${ev.currentEvB}B
        </Badge>
      </div>
      <EvInputsGrid f={f} onPatch={props.onPatchDrivers} />
      <EvSummaryGrid ev={ev} />
    </Card>
  );
}
