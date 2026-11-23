"use client";

import { Label, Slider } from "@heroui/react";
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
      <Slider.Output className="font-mono text-sm font-semibold text-ink-primary tabular-nums">
        {displayValue}
      </Slider.Output>
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  );
}
