"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type ButtonGroupTone = "neutral" | "pass" | "warn" | "fail" | "coral";

const TONE_DOT: Record<ButtonGroupTone, string> = {
  neutral: "bg-ink-primary",
  pass: "bg-status-pass",
  warn: "bg-status-warn",
  fail: "bg-status-fail",
  coral: "bg-accent-coral",
};

const TONE_SELECTED: Record<ButtonGroupTone, string> = {
  neutral: "bg-muted text-ink-primary font-semibold",
  pass: "bg-status-pass-soft text-status-pass font-semibold",
  warn: "bg-status-warn-soft text-status-warn font-semibold",
  fail: "bg-status-fail-soft text-status-fail font-semibold",
  coral: "bg-accent-coral-soft text-accent-coral font-semibold",
};

export interface ButtonGroupProps {
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function ButtonGroup({ children, ariaLabel, className }: ButtonGroupProps) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        "isolate m-0 inline-flex items-stretch overflow-hidden rounded-control border border-strong/75 bg-surface p-0 shadow-group divide-x divide-hairline",
        className,
      )}
    >
      {children}
    </fieldset>
  );
}

export interface ButtonGroupItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  tone?: ButtonGroupTone;
  size?: "sm" | "md";
  showDot?: boolean;
}

export function ButtonGroupItem({
  selected = false,
  tone = "neutral",
  size = "md",
  showDot = false,
  className,
  children,
  type = "button",
  ...props
}: ButtonGroupItemProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-medium select-none",
        "transition-[background-color,color] duration-150 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-coral",
        "disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-9 px-3 text-sm" : "h-10 px-4 text-sm",
        selected
          ? TONE_SELECTED[tone]
          : "bg-surface text-ink-secondary hover:bg-muted/65 hover:text-ink-primary",
        className,
      )}
      {...props}
    >
      {showDot ? (
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-pill transition-opacity",
            selected ? TONE_DOT[tone] : "bg-ink-muted/40",
          )}
        />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
