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
  neutral: "border-hairline bg-surface text-ink-primary shadow-pill-active font-semibold",
  pass: "border-status-pass/25 bg-surface text-status-pass shadow-pill-active font-semibold",
  warn: "border-status-warn/25 bg-surface text-status-warn shadow-pill-active font-semibold",
  fail: "border-status-fail/25 bg-surface text-status-fail shadow-pill-active font-semibold",
  coral: "border-accent-coral/25 bg-surface text-accent-coral shadow-pill-active font-semibold",
};

export interface ButtonGroupProps {
  children: ReactNode;
  ariaLabel?: string;
  equalWidth?: boolean;
  className?: string;
}

export function ButtonGroup({
  children,
  ariaLabel,
  equalWidth = false,
  className,
}: ButtonGroupProps) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        "m-0 items-center gap-0.5 rounded-control border border-hairline bg-muted/80 p-1 shadow-input",
        equalWidth ? "inline-grid auto-cols-fr grid-flow-col" : "inline-flex",
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
        "inline-grid shrink-0 cursor-pointer place-items-center whitespace-nowrap rounded-badge border font-medium leading-none select-none",
        "transition-[background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-kanon)] motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral/70",
        "disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3.5 text-xs sm:text-[13px]",
        selected
          ? TONE_SELECTED[tone]
          : "border-transparent bg-transparent text-ink-secondary hover:bg-surface/60 hover:text-ink-primary active:bg-surface/80",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none invisible col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 font-semibold"
      >
        {showDot ? <span className="h-1.5 w-1.5 shrink-0" /> : null}
        <span>{children}</span>
      </span>
      <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5">
        {showDot && selected ? (
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 shrink-0 rounded-pill", TONE_DOT[tone])}
          />
        ) : null}
        <span>{children}</span>
      </span>
    </button>
  );
}
