"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type StatDeltaTone = "pass" | "warn" | "fail" | "coral" | "neutral";

const DELTA_PILL_TONE: Record<StatDeltaTone, string> = {
  pass: "bg-status-pass-soft text-status-pass",
  warn: "bg-status-warn-soft text-status-warn",
  fail: "bg-status-fail-soft text-status-fail",
  coral: "bg-accent-coral-soft text-accent-coral",
  neutral: "bg-muted text-ink-secondary",
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  caption?: ReactNode;
  delta?: ReactNode;
  deltaTone?: StatDeltaTone;
  onClick?: () => void;
  className?: string;
}

function StatFooterBand({
  caption,
  delta,
  deltaTone = "neutral",
}: {
  caption?: ReactNode;
  delta?: ReactNode;
  deltaTone?: StatDeltaTone;
}) {
  if (!caption && !delta) return null;
  return (
    <div className="mt-auto flex items-center justify-between gap-2 rounded-control border border-hairline bg-surface px-2.5 py-1.5 shadow-card">
      <span className="min-w-0 truncate text-xs text-ink-muted">{caption}</span>
      {delta ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center whitespace-nowrap rounded-pill px-2 py-0.5 font-mono text-xs font-medium tabular-nums",
            DELTA_PILL_TONE[deltaTone],
          )}
        >
          {delta}
        </span>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  caption,
  delta,
  deltaTone = "neutral",
  onClick,
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
        <span className="truncate text-xs font-medium text-ink-secondary">{label}</span>
        {icon ? (
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-hairline bg-surface text-ink-secondary shadow-card"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="px-2.5 pb-2.5 pt-1.5 font-mono text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink-primary tabular-nums">
        {value}
      </div>
      <StatFooterBand caption={caption} delta={delta} deltaTone={deltaTone} />
    </>
  );

  const shellClass = cn(
    "flex min-w-0 flex-col rounded-card border border-hairline bg-muted/65 p-1.5 transition-[border-color,background-color] duration-150",
    onClick &&
      "cursor-pointer text-left hover:border-strong hover:bg-muted/85 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-coral",
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shellClass}>
        {body}
      </button>
    );
  }
  return <section className={shellClass}>{body}</section>;
}
