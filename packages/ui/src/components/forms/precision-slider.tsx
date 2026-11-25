"use client";

import { Label, Slider } from "@heroui/react";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { cn } from "../../lib/cn";

export interface PrecisionSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (next: number) => void;
  className?: string;
}

function clampStep(value: number, delta: number, min: number, max: number, step: number): number {
  const decimals = step < 1 ? 2 : 0;
  return Number(Math.min(max, Math.max(min, value + delta)).toFixed(decimals));
}

function NudgeButton({
  ariaLabel,
  disabled,
  kind,
  onClick,
}: {
  ariaLabel: string;
  disabled: boolean;
  kind: "dec" | "inc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-badge border border-hairline bg-surface text-ink-muted transition-colors duration-150 hover:border-strong hover:bg-muted/60 hover:text-ink-primary active:bg-muted disabled:opacity-35"
    >
      {kind === "dec" ? <IconMinus size={11} stroke={1.5} /> : <IconPlus size={11} stroke={1.5} />}
    </button>
  );
}

function resolveSliderBounds(value: number, min: number, max: number, step: number) {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 0.1;
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + safeStep * 10;
  const safeVal = Number.isFinite(value) ? Math.min(safeMax, Math.max(safeMin, value)) : safeMin;
  return { safeStep, safeMin, safeMax, safeVal };
}

export function PrecisionSlider({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
  className,
}: PrecisionSliderProps) {
  const { safeStep, safeMin, safeMax, safeVal } = resolveSliderBounds(value, min, max, step);

  return (
    <Slider
      value={safeVal}
      minValue={safeMin}
      maxValue={safeMax}
      step={safeStep}
      onChange={(next) => {
        if (typeof next === "number" && Number.isFinite(next)) {
          onChange(Math.min(safeMax, Math.max(safeMin, next)));
        }
      }}
      className={cn("w-full gap-2", className)}
    >
      <Label className="text-xs font-medium text-ink-secondary">{label}</Label>
      <div className="flex items-center gap-1.5">
        <NudgeButton
          ariaLabel={`减少 ${label}`}
          disabled={safeVal <= safeMin}
          kind="dec"
          onClick={() => onChange(clampStep(safeVal, -safeStep, safeMin, safeMax, safeStep))}
        />
        <Slider.Output className="min-w-[46px] text-center font-mono text-sm font-semibold text-ink-primary tabular-nums">
          {displayValue}
        </Slider.Output>
        <NudgeButton
          ariaLabel={`增加 ${label}`}
          disabled={safeVal >= safeMax}
          kind="inc"
          onClick={() => onChange(clampStep(safeVal, safeStep, safeMin, safeMax, safeStep))}
        />
      </div>
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  );
}
