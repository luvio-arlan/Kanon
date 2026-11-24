import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-control border border-hairline bg-surface px-3.5 py-2 text-sm text-ink-primary shadow-card",
        "placeholder:text-ink-muted transition-[border-color,box-shadow,background-color] duration-150",
        "hover:border-strong focus-visible:outline-none focus-visible:border-accent-coral focus-visible:ring-[3px] focus-visible:ring-accent-coral-soft",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
