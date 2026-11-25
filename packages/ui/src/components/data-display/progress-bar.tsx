"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type ProgressTone = "accent" | "pass" | "warn" | "fail" | "ink";
export type ProgressSize = "sm" | "md" | "lg";

const TONE_CLASS: Record<ProgressTone, string> = {
  accent: "text-accent-coral",
  pass: "text-status-pass",
  warn: "text-status-warn",
  fail: "text-status-fail",
  ink: "text-ink-primary",
};

const SIZE_CLASS: Record<ProgressSize, string> = {
  sm: "h-1",
  md: "h-1.5",
  lg: "h-2",
};

export interface ProgressBarProps {
  value?: number;
  max?: number;
  indeterminate?: boolean;
  tone?: ProgressTone;
  size?: ProgressSize;
  label?: ReactNode;
  valueLabel?: ReactNode;
  className?: string;
}

function IndeterminateSweep() {
  return (
    <span aria-hidden="true" className="absolute inset-0 [clip-path:inset(-8px_0_round_9999px)]">
      <span className="kanon-progress-sweep absolute inset-y-0 left-0 w-2/5">
        <span className="absolute -inset-y-[4px] left-0 right-[10px] rounded-pill bg-linear-to-r from-transparent to-current opacity-30 blur-[4px]" />
        <span className="absolute -inset-y-[1.5px] left-[25%] right-[4px] rounded-pill bg-linear-to-r from-transparent to-current opacity-60 blur-[2px]" />
        <span className="absolute inset-y-0 left-[35%] right-0 rounded-pill bg-linear-to-r from-transparent to-current" />
      </span>
    </span>
  );
}

function ProgressLabelRow({ label, valueLabel }: { label?: ReactNode; valueLabel?: ReactNode }) {
  if (!label && !valueLabel) return null;
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="min-w-0 truncate text-ink-secondary">{label}</span>
      {valueLabel ? (
        <span className="shrink-0 font-mono text-ink-muted tabular-nums">{valueLabel}</span>
      ) : null}
    </div>
  );
}

export function ProgressBar({
  value = 0,
  max = 100,
  indeterminate = false,
  tone = "accent",
  size = "sm",
  label,
  valueLabel,
  className,
}: ProgressBarProps) {
  const safeMax = Math.max(1, max);
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));

  return (
    <div
      role="progressbar"
      aria-label={typeof label === "string" ? label : "进度"}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      className={cn("flex w-full flex-col gap-1.5", className)}
    >
      <ProgressLabelRow label={label} valueLabel={valueLabel} />
      <div
        className={cn(
          "relative w-full rounded-pill bg-titanium/80",
          SIZE_CLASS[size],
          TONE_CLASS[tone],
        )}
      >
        {indeterminate ? (
          <IndeterminateSweep />
        ) : (
          <span className="absolute inset-0 overflow-hidden rounded-pill">
            <span
              className="absolute inset-0 rounded-pill bg-current transition-[translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ translate: `${-(100 - pct)}% 0` }}
            />
          </span>
        )}
      </div>
    </div>
  );
}
