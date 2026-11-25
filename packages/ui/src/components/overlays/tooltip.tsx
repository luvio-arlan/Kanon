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
          "kanon-tooltip z-50 max-w-xs break-normal rounded-item border border-hairline bg-ink-primary px-2.5 py-1.5",
          "text-xs leading-snug text-ink-inverse shadow-dropdown",
          className,
        )}
      >
        {content}
      </HeroTooltip.Content>
    </HeroTooltip>
  );
}
