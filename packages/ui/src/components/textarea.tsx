import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-[88px] w-full rounded-control border border-hairline bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink-primary",
        "placeholder:text-ink-muted transition-colors duration-150",
        "hover:border-strong focus-visible:border-accent-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral-soft",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
