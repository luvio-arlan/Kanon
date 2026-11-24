"use client";

import { Tooltip as HeroTooltip } from "@heroui/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function Tooltip({ content, children, delay = 180, className }: TooltipProps) {
  return (
    <HeroTooltip delay={delay}>
      <HeroTooltip.Trigger<"span">
        render={(triggerProps) => <span {...triggerProps} />}
        className="inline-flex items-center"
      >
        {children}
      </HeroTooltip.Trigger>
      <HeroTooltip.Content
        offset={8}
        className={cn(
          "z-50 max-w-xs rounded-control border border-hairline bg-ink-primary px-2.5 py-1.5",
          "text-xs text-ink-inverse shadow-overlay",
          className,
        )}
      >
        {content}
      </HeroTooltip.Content>
    </HeroTooltip>
  );
}
