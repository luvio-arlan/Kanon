"use client";

import { Label, Slider } from "@heroui/react";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { cn } from "../lib/cn";

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
      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-hairline bg-surface text-ink-muted transition-colors hover:border-strong hover:text-ink-primary disabled:opacity-35"
    >
      {kind === "dec" ? <IconMinus size={11} stroke={1.5} /> : <IconPlus size={11} stroke={1.5} />}
    </button>
  );
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
  return (
    <Slider
      value={value}
      minValue={min}
      maxValue={max}
      step={step}
      onChange={(next) => {
        if (typeof next === "number") onChange(next);
      }}
      className={cn("w-full gap-2", className)}
    >
      <Label className="text-xs font-medium text-ink-secondary">{label}</Label>
      <div className="flex items-center gap-1.5">
        <NudgeButton
          ariaLabel={`减少 ${label}`}
          disabled={value <= min}
          kind="dec"
          onClick={() => onChange(clampStep(value, -step, min, max, step))}
        />
        <Slider.Output className="min-w-[46px] text-center font-mono text-sm font-semibold text-ink-primary tabular-nums">
          {displayValue}
        </Slider.Output>
        <NudgeButton
          ariaLabel={`增加 ${label}`}
          disabled={value >= max}
          kind="inc"
          onClick={() => onChange(clampStep(value, step, min, max, step))}
        />
      </div>
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  );
}
