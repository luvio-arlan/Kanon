"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { KANON_TAB_TRANSITION } from "../../lib/motion";

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export interface SegmentedTabsProps<T extends string> {
  items: readonly SegmentedTabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  layoutId: string;
  className?: string;
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  layoutId,
  className,
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-control border border-hairline bg-muted/75 p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative inline-flex h-8 cursor-pointer items-center justify-center whitespace-nowrap rounded-[7px] px-3.5 text-sm font-medium leading-none transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-coral/70",
              active ? "text-ink-primary" : "text-ink-secondary hover:text-ink-primary",
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                transition={KANON_TAB_TRANSITION}
                style={{ borderRadius: 7 }}
                className="pointer-events-none absolute inset-0 rounded-[7px] border border-hairline bg-surface shadow-pill-active"
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {item.icon}
              <span>{item.label}</span>
              {typeof item.count === "number" ? (
                <span className="font-mono text-xs text-ink-muted tabular-nums">{item.count}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
