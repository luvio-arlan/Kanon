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
    <div className="mt-auto flex items-center justify-between gap-2 border-t border-hairline px-5 py-3">
      <span className="min-w-0 truncate text-xs text-ink-muted">{caption}</span>
      {delta ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-xs font-medium tabular-nums",
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
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <span className="truncate text-sm font-medium text-ink-secondary">{label}</span>
        {icon ? (
          <span aria-hidden="true" className="shrink-0 text-ink-muted">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="px-5 pb-4 pt-3 font-mono text-[32px] font-light leading-none tracking-[-0.04em] text-ink-primary tabular-nums">
        {value}
      </div>
      <StatFooterBand caption={caption} delta={delta} deltaTone={deltaTone} />
    </>
  );

  const shellClass = cn(
    "flex min-w-0 flex-col rounded-card border border-hairline bg-surface shadow-card transition-[border-color,box-shadow] duration-150",
    onClick &&
      "cursor-pointer text-left hover:border-strong hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral",
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
