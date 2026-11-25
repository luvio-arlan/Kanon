"use client";

import { Popover } from "@heroui/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface GlossaryPopoverCardProps {
  triggerText: string;
  heading: string;
  category?: string;
  children: ReactNode;
  className?: string;
}

export function GlossaryPopoverCard({
  triggerText,
  heading,
  category,
  children,
  className,
}: GlossaryPopoverCardProps) {
  return (
    <Popover>
      <Popover.Trigger<"span">
        render={(triggerProps) => <span {...triggerProps} />}
        className={cn(
          "inline cursor-pointer rounded-badge px-0.5 -mx-0.5 text-inherit",
          "underline decoration-strong/75 decoration-dotted underline-offset-[4px]",
          "transition-colors duration-150 ease-[var(--ease-kanon)] hover:bg-accent-coral-soft/65 hover:text-accent-coral hover:decoration-accent-coral",
          className,
        )}
      >
        {triggerText}
      </Popover.Trigger>
      <Popover.Content placement="top" offset={8} className="z-50 max-w-sm">
        <Popover.Dialog className="rounded-panel border border-strong bg-surface-elevated p-4 shadow-dropdown">
          <Popover.Arrow />
          <div className="flex items-center justify-between gap-2">
            <Popover.Heading className="text-sm font-semibold text-ink-primary">
              {heading}
            </Popover.Heading>
            {category ? (
              <span className="shrink-0 whitespace-nowrap rounded-pill bg-titanium-subtle px-2 py-0.5 text-xs text-ink-secondary">
                {category}
              </span>
            ) : null}
          </div>
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-ink-secondary">
            {children}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
