"use client";

import { cn } from "../../lib/cn";

export type MarketSessionKind = "PRE" | "REGULAR" | "POST" | "CLOSED";

export interface MarketSessionBadgeProps {
  session: MarketSessionKind;
  compact?: boolean;
  className?: string;
}

const SESSION_META: Record<
  MarketSessionKind,
  { label: string; short: string; dotClass: string; badgeClass: string; pulse: boolean }
> = {
  PRE: {
    label: "盘前交易",
    short: "盘前",
    dotClass: "bg-status-warn",
    badgeClass: "border-status-warn/25 bg-status-warn-soft text-status-warn",
    pulse: true,
  },
  REGULAR: {
    label: "美股盘中",
    short: "盘中",
    dotClass: "bg-status-pass",
    badgeClass: "border-status-pass/25 bg-status-pass-soft text-status-pass",
    pulse: true,
  },
  POST: {
    label: "盘后交易",
    short: "盘后",
    dotClass: "bg-accent-coral",
    badgeClass: "border-accent-coral/25 bg-accent-coral-soft text-accent-coral",
    pulse: true,
  },
  CLOSED: {
    label: "休市参考",
    short: "休市",
    dotClass: "bg-ink-muted",
    badgeClass: "border-hairline bg-muted/80 text-ink-secondary",
    pulse: false,
  },
};

export function MarketSessionBadge({
  session,
  compact = false,
  className,
}: MarketSessionBadgeProps) {
  const meta = SESSION_META[session];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-badge border px-2 py-0.5 font-mono text-xs font-medium leading-none tabular-nums",
        meta.badgeClass,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 rounded-pill", meta.dotClass, meta.pulse && "kanon-session-dot")}
      />
      <span>{compact ? meta.short : meta.label}</span>
    </span>
  );
}
