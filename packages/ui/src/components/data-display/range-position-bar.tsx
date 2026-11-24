"use client";

import { cn } from "../../lib/cn";

export interface RangePositionBarProps {
  positionPct: number;
  lowLabel?: string;
  highLabel?: string;
  tone?: "coral" | "pass" | "ink";
  className?: string;
}

export function RangePositionBar({
  positionPct,
  lowLabel,
  highLabel,
  tone = "coral",
  className,
}: RangePositionBarProps) {
  const clamped = Math.min(100, Math.max(0, positionPct));
  const dotCls =
    tone === "pass" ? "bg-status-pass" : tone === "ink" ? "bg-ink-primary" : "bg-accent-coral";
  const fillCls =
    tone === "pass"
      ? "bg-status-pass/45"
      : tone === "ink"
        ? "bg-ink-primary/35"
        : "bg-accent-coral/45";

  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-1.5 w-full rounded-pill bg-muted">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-pill transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            fillCls,
          )}
          style={{ width: `${clamped}%` }}
        />
        <div
          className={cn(
            "absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill ring-2 ring-surface transition-[left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            dotCls,
          )}
          style={{ left: `${clamped}%` }}
        />
      </div>
      {lowLabel || highLabel ? (
        <div className="mt-1 flex items-center justify-between font-mono text-xs text-ink-muted tabular-nums">
          <span>{lowLabel ?? ""}</span>
          <span>{highLabel ?? ""}</span>
        </div>
      ) : null}
    </div>
  );
}
