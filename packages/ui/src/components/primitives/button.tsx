import type { ButtonHTMLAttributes } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../lib/cn";

export const buttonVariants = tv({
  base: [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium",
    "rounded-control text-sm transition-all duration-150 select-none cursor-pointer motion-reduce:transition-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:opacity-45 active:scale-[0.97]",
  ].join(" "),
  variants: {
    variant: {
      primary:
        "bg-ink-primary text-ink-inverse border border-transparent hover:opacity-90 shadow-card",
      titanium:
        "bg-titanium text-ink-primary border border-hairline hover:border-strong hover:bg-titanium-subtle",
      outline:
        "bg-surface text-ink-primary border border-hairline hover:border-strong hover:bg-muted/60 shadow-card",
      ghost: "bg-transparent text-ink-secondary hover:text-ink-primary hover:bg-muted/80",
      coral:
        "bg-accent-coral-soft text-accent-coral border border-accent-coral/30 hover:border-accent-coral/60",
    },
    size: {
      sm: "h-8 px-3 text-xs",
      md: "h-9 px-3.5 text-sm",
      lg: "h-10 px-4 text-sm",
      icon: "h-8 w-8 p-0",
    },
  },
  defaultVariants: {
    variant: "outline",
    size: "md",
  },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
