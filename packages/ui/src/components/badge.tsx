import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium transition-colors duration-150",
  {
    variants: {
      variant: {
        default: "border-hairline bg-muted text-ink-secondary",
        titanium: "border-hairline bg-titanium text-ink-primary",
        mono: "border-hairline bg-muted/80 text-ink-secondary font-mono tabular-nums",
        pass: "border-status-pass/20 bg-status-pass-soft text-status-pass",
        warn: "border-status-warn/25 bg-status-warn-soft text-status-warn",
        fail: "border-status-fail/20 bg-status-fail-soft text-status-fail",
        coral: "border-accent-coral/25 bg-accent-coral-soft text-accent-coral",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
