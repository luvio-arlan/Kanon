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

  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-1 w-full rounded-pill bg-muted">
        <div
          className={cn(
            "absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill ring-2 ring-surface",
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
