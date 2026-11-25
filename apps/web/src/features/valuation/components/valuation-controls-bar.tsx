"use client";

import { PROBABILITY_PRESETS, type ProbabilityPreset, type ValuationModelMode } from "@kanon/core";
import { cn, Input } from "@kanon/ui";
import { CustomProbabilityPopover } from "./drivers/custom-probability-strip";

const HORIZONS = [2, 3, 5] as const;
const MODEL_MODES: ReadonlyArray<{ id: ValuationModelMode; label: string }> = [
  { id: "pe", label: "PE 主锚" },
  { id: "ev_fcf", label: "EV/FCF 主锚" },
];

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

function ModelModePills({
  modelMode,
  onModelMode,
}: {
  modelMode: ValuationModelMode;
  onModelMode: (mode: ValuationModelMode) => void;
}) {
  return (
    <div className="inline-flex rounded-pill border border-hairline bg-muted/70 p-0.5">
      {MODEL_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onModelMode(m.id)}
          className={cn(
            "cursor-pointer rounded-pill px-2.5 py-1 text-xs font-medium transition-colors",
            modelMode === m.id
              ? "bg-surface text-ink-primary shadow-card"
              : "text-ink-muted hover:text-ink-primary",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function ProbabilityPresetRow(props: {
  activePreset: string | null;
  modelMode: ValuationModelMode;
  bearProb: number;
  baseProb: number;
  bullProb: number;
  onApplyPreset: (preset: ProbabilityPreset) => void;
  onCustomProb: (bearPct: number, basePct: number, bullPct: number) => void;
  onModelMode: (mode: ValuationModelMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-ink-muted">概率权重</span>
        {PROBABILITY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => props.onApplyPreset(preset)}
            className={cn(
              "cursor-pointer rounded-pill border px-3 py-1 font-mono text-xs transition-colors",
              props.activePreset === preset.id
                ? "border-strong bg-titanium text-ink-primary font-semibold"
                : "border-hairline bg-surface text-ink-secondary hover:border-strong",
            )}
          >
            {preset.label}
          </button>
        ))}
        <CustomProbabilityPopover
          bearProb={props.bearProb}
          baseProb={props.baseProb}
          bullProb={props.bullProb}
          onApply={props.onCustomProb}
        />
      </div>
      <ModelModePills modelMode={props.modelMode} onModelMode={props.onModelMode} />
    </div>
  );
}

function CurrentPriceControl(p: {
  currentPrice: number;
  latestSecEps?: number | null;
  onPrice: (next: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="kanon-current-price" className="text-sm font-medium text-ink-primary">
        当前参考价 ($)
      </label>
      <Input
        id="kanon-current-price"
        type="number"
        min={0.5}
        step={0.5}
        value={p.currentPrice}
        onChange={(e) => p.onPrice(Number(e.target.value) || 0)}
        className="w-28 font-mono tabular-nums"
      />
      {p.latestSecEps && p.latestSecEps > 0 ? (
        <span className="rounded-pill bg-titanium-subtle px-2.5 py-1 font-mono text-xs text-ink-secondary tabular-nums">
          年报 EPS ${p.latestSecEps.toFixed(2)}
        </span>
      ) : null}
    </div>
  );
}

export function ValuationControlsBar(props: {
  currentPrice: number;
  horizonYears: number;
  latestSecEps?: number | null;
  activePreset: string | null;
  modelMode: ValuationModelMode;
  bearProb: number;
  baseProb: number;
  bullProb: number;
  onPrice: (next: number) => void;
  onHorizon: (next: number) => void;
  onApplyPreset: (preset: ProbabilityPreset) => void;
  onCustomProb: (bearPct: number, basePct: number, bullPct: number) => void;
  onModelMode: (mode: ValuationModelMode) => void;
}) {
  return (
    <div className="space-y-3 rounded-card border border-hairline bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <CurrentPriceControl
          currentPrice={props.currentPrice}
          latestSecEps={props.latestSecEps}
          onPrice={props.onPrice}
        />
        <HorizonPills value={props.horizonYears} onChange={props.onHorizon} />
      </div>
      <ProbabilityPresetRow
        activePreset={props.activePreset}
        modelMode={props.modelMode}
        bearProb={props.bearProb}
        baseProb={props.baseProb}
        bullProb={props.bullProb}
        onApplyPreset={props.onApplyPreset}
        onCustomProb={props.onCustomProb}
        onModelMode={props.onModelMode}
      />
    </div>
  );
}
