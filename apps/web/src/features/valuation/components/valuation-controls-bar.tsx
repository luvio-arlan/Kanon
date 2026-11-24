"use client";

import { PROBABILITY_PRESETS, type ProbabilityPreset } from "@kanon/core";
import { cn, Input } from "@kanon/ui";

const HORIZONS = [2, 3, 5] as const;

function HorizonPills({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-muted">投资周期</span>
      <div className="inline-flex rounded-pill border border-hairline bg-muted/70 p-1">
        {HORIZONS.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => onChange(year)}
            className={cn(
              "cursor-pointer rounded-pill px-3 py-1 font-mono text-xs font-medium transition-colors",
              value === year
                ? "bg-surface text-ink-primary shadow-card"
                : "text-ink-secondary hover:text-ink-primary",
            )}
          >
            {year} 年
          </button>
        ))}
      </div>
    </div>
  );
}

function ProbabilityPresetRow({
  activePreset,
  onApplyPreset,
}: {
  activePreset: string | null;
  onApplyPreset: (preset: ProbabilityPreset) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
      <span className="text-xs text-ink-muted">情景概率权重（用于期望目标价）</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {PROBABILITY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApplyPreset(preset)}
            className={cn(
              "cursor-pointer rounded-pill border px-3 py-1 font-mono text-xs transition-colors",
              activePreset === preset.id
                ? "border-strong bg-titanium text-ink-primary font-semibold"
                : "border-hairline bg-surface text-ink-secondary hover:border-strong",
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ValuationControlsBar(props: {
  currentPrice: number;
  horizonYears: number;
  latestSecEps?: number | null;
  activePreset: string | null;
  onPrice: (next: number) => void;
  onHorizon: (next: number) => void;
  onApplyPreset: (preset: ProbabilityPreset) => void;
}) {
  return (
    <div className="space-y-3 rounded-card border border-hairline bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="kanon-current-price" className="text-sm font-medium text-ink-primary">
            当前参考价 ($)
          </label>
          <Input
            id="kanon-current-price"
            type="number"
            min={0.5}
            step={0.5}
            value={props.currentPrice}
            onChange={(e) => props.onPrice(Number(e.target.value) || 0)}
            className="w-28 font-mono tabular-nums"
          />
          {props.latestSecEps && props.latestSecEps > 0 ? (
            <span className="rounded-pill bg-titanium-subtle px-2.5 py-1 font-mono text-xs text-ink-secondary tabular-nums">
              SEC 最新年报 EPS ${props.latestSecEps.toFixed(2)}
            </span>
          ) : null}
        </div>
        <HorizonPills value={props.horizonYears} onChange={props.onHorizon} />
      </div>
      <ProbabilityPresetRow activePreset={props.activePreset} onApplyPreset={props.onApplyPreset} />
    </div>
  );
}
