import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface KbdProps extends HTMLAttributes<HTMLElement> {}

export function Kbd({ className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-pill border border-hairline bg-muted/85 px-1.5 py-0.5 font-mono text-xs font-medium leading-none tracking-normal text-ink-muted tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
