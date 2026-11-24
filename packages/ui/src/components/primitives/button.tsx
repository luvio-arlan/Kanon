import { IconLoader2 } from "@tabler/icons-react";
import type { ButtonHTMLAttributes } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../lib/cn";

export const buttonVariants = tv({
  base: [
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium leading-none",
    "rounded-control text-sm select-none cursor-pointer",
    "transition-[transform,background-color,border-color,box-shadow,color,opacity] duration-150 motion-reduce:transition-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:opacity-45 active:scale-[0.975]",
  ].join(" "),
  variants: {
    variant: {
      primary:
        "bg-ink-primary text-ink-inverse border border-transparent hover:opacity-92 shadow-button-primary",
      titanium:
        "bg-titanium text-ink-primary border border-hairline hover:border-strong hover:bg-titanium-subtle shadow-button",
      outline:
        "bg-surface text-ink-primary border border-hairline hover:border-strong hover:bg-muted/65 shadow-button",
      ghost: "bg-transparent text-ink-secondary hover:text-ink-primary hover:bg-muted/75",
      coral:
        "bg-accent-coral-soft text-accent-coral border border-accent-coral/35 hover:border-accent-coral/70 shadow-button",
    },
    size: {
      sm: "h-8 gap-1.5 px-3 text-xs",
      md: "h-9 gap-2 px-3.5 text-sm",
      lg: "h-10 gap-2 px-4 text-sm",
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
      {loading ? <IconLoader2 size={14} stroke={1.5} className="animate-spin" /> : null}
      {children}
    </button>
  );
}
