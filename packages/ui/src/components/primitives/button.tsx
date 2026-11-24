import type { ButtonHTMLAttributes } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../lib/cn";
import { Spinner } from "./spinner";

export const buttonVariants = tv({
  base: [
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium leading-none",
    "rounded-control text-sm select-none cursor-pointer",
    "transition-[background-color,border-color,box-shadow,color,opacity] duration-150 motion-reduce:transition-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:opacity-45",
  ].join(" "),
  variants: {
    variant: {
      primary:
        "kanon-cta-sheen bg-ink-primary text-ink-inverse border border-ink-primary hover:opacity-90 active:opacity-80 shadow-button-primary",
      titanium:
        "bg-titanium text-ink-primary border border-strong/70 hover:bg-titanium-subtle hover:border-strong active:bg-muted shadow-button",
      outline:
        "bg-surface text-ink-primary border border-strong/70 hover:border-strong hover:bg-muted/60 active:bg-muted shadow-button",
      ghost:
        "bg-transparent text-ink-secondary hover:text-ink-primary hover:bg-muted/80 active:bg-muted",
      coral:
        "bg-accent-coral text-ink-inverse border border-accent-coral hover:opacity-92 active:opacity-85 shadow-button-primary",
      danger:
        "bg-surface text-status-fail border border-status-fail/35 hover:border-status-fail/70 hover:bg-status-fail-soft shadow-button",
    },
    size: {
      sm: "h-9 gap-1.5 px-3.5 text-sm",
      md: "h-10 gap-2 px-4 text-sm",
      lg: "h-11 gap-2 px-5 text-sm",
      icon: "h-9 w-9 p-0",
    },
  },
  defaultVariants: {
    variant: "outline",
    size: "md",
  },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <Spinner size="xs" decorative className="text-current" /> : null}
      {children}
    </button>
  );
}
