"use client";

import { formatMoney, Input } from "@kanon/ui";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";

export interface ImplicitAssumptions {
  terminalGrowthPct: number;
  taxRatePct: number;
  terminalRonicPct: number;
  capRonicPct: number;
  exitMultiple: number;
}

const IMPLICIT_FIELDS = [
  ["terminalGrowthPct", "永续 g (%)", "0.2"],
  ["taxRatePct", "有效税率 (%)", "1"],
  ["terminalRonicPct", "终值 RONIC (%)", "1"],
  ["capRonicPct", "CAP RONIC (%)", "1"],
  ["exitMultiple", "退出 EV/NOPAT", "1"],
] as const;

function ImplicitFieldsGrid({
  vals,
  onChange,
}: {
  vals: ImplicitAssumptions;
  onChange: (k: keyof ImplicitAssumptions, raw: string) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-hairline pt-3 sm:grid-cols-5">
      {IMPLICIT_FIELDS.map(([key, label, step]) => (
        <div key={key} className="space-y-1">
          <div className="text-ink-muted">{label}</div>
          <Input
            aria-label={label}
            type="number"
            step={step}
            value={String(vals[key])}
            onChange={(e) => onChange(key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

export function ImplicitAssumptionsBar({
  vals,
  onChange,
}: {
  vals: ImplicitAssumptions;
  onChange: (k: keyof ImplicitAssumptions, raw: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-control border border-hairline bg-canvas/40 px-3.5 py-2 text-xs">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-ink-secondary hover:text-ink-primary"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-mono tabular-nums">
          隐含假设 · g {vals.terminalGrowthPct.toFixed(1)}% · t {vals.taxRatePct.toFixed(0)}% ·
          RONIC {vals.terminalRonicPct.toFixed(0)}% · EV/NOPAT {vals.exitMultiple.toFixed(0)}×
        </span>
        {open ? (
          <IconChevronDown size={14} stroke={1.5} />
        ) : (
          <IconChevronRight size={14} stroke={1.5} />
        )}
      </button>
      {open ? <ImplicitFieldsGrid vals={vals} onChange={onChange} /> : null}
    </div>
  );
}

function BandAxisTrack({
  dcfFairValue,
  mcP10,
  mcP50,
  mcP90,
  currentPrice,
}: {
  dcfFairValue: number;
  mcP10: number;
  mcP50: number;
  mcP90: number;
  currentPrice: number;
}) {
  const minVal = Math.max(0, Math.min(mcP10, dcfFairValue, currentPrice) * 0.85);
  const maxVal = Math.max(mcP90, dcfFairValue, currentPrice, minVal + 1) * 1.1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - minVal) / (maxVal - minVal)) * 100));

  return (
    <div className="relative h-6 w-full">
      <div className="absolute left-0 right-0 top-2.5 h-1 rounded-pill bg-hairline" />
      <div
        className="absolute top-2 h-2 rounded-pill bg-titanium/35"
        style={{ left: `${pct(mcP10)}%`, width: `${Math.max(2, pct(mcP90) - pct(mcP10))}%` }}
      />
      <div
        title={`蒙特卡洛 P50 现值 ${formatMoney(mcP50, "USD", { maximumFractionDigits: 1 })}`}
        className="absolute top-1.5 h-3 w-0.5 bg-ink-secondary"
        style={{ left: `${pct(mcP50)}%` }}
      />
      <div
        title={`FCFF DCF 现值 ${formatMoney(dcfFairValue, "USD", { maximumFractionDigits: 1 })}`}
        className="absolute top-1 h-4 w-1 rounded-pill bg-ink-primary"
        style={{ left: `${pct(dcfFairValue)}%` }}
      />
      <div
        title={`当前价格 ${formatMoney(currentPrice, "USD", { maximumFractionDigits: 1 })}`}
        className="absolute top-0.5 h-5 w-1 rounded-pill bg-accent-coral"
        style={{ left: `${pct(currentPrice)}%` }}
      />
    </div>
  );
}

export interface UnifiedValuationBandProps {
  dcfFairValue: number;
  mcP10: number;
  mcP50: number;
  mcP90: number;
  currentPrice: number;
  probAboveCurrent: number;
  impliedCapYears: number;
  terminalSharePct: number;
  valueDestroyingGrowth: boolean;
}

export function UnifiedValuationBand(p: UnifiedValuationBandProps) {
  return (
    <div className="space-y-3 rounded-control border border-hairline bg-canvas/50 p-4 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-4 font-mono tabular-nums">
          <span className="text-ink-primary">
            DCF 现值{" "}
            <strong className="text-sm">
              {formatMoney(p.dcfFairValue, "USD", { maximumFractionDigits: 1 })}
            </strong>
          </span>
          <span className="text-ink-secondary">
            分布现值 P10 {formatMoney(p.mcP10, "USD", { maximumFractionDigits: 0 })} · P50{" "}
            {formatMoney(p.mcP50, "USD", { maximumFractionDigits: 1 })} · P90{" "}
            {formatMoney(p.mcP90, "USD", { maximumFractionDigits: 0 })}
          </span>
        </div>
        <span className="font-mono text-ink-secondary tabular-nums">
          高于现价 {p.probAboveCurrent.toFixed(0)}% · 隐含 CAP {p.impliedCapYears.toFixed(1)} 年
        </span>
      </div>
      <BandAxisTrack
        dcfFairValue={p.dcfFairValue}
        mcP10={p.mcP10}
        mcP50={p.mcP50}
        mcP90={p.mcP90}
        currentPrice={p.currentPrice}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-ink-muted">
        <span className="font-mono tabular-nums">
          现价 {formatMoney(p.currentPrice, "USD", { maximumFractionDigits: 1 })}（珊瑚标线） ·
          终值占比 {p.terminalSharePct}%
        </span>
        {p.valueDestroyingGrowth ? (
          <span className="text-status-warn">注意：终值 RONIC 低于 WACC，增长将稀释价值</span>
        ) : null}
      </div>
    </div>
  );
}
