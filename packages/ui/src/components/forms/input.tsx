import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-control border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-primary",
        "placeholder:text-ink-muted transition-colors duration-150",
        "hover:border-strong focus-visible:outline-none focus-visible:border-accent-coral focus-visible:ring-2 focus-visible:ring-accent-coral-soft",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
