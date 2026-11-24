import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-[108px] w-full rounded-control border border-hairline bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink-primary shadow-card",
        "placeholder:text-ink-muted/85 transition-[border-color,box-shadow,background-color] duration-150",
        "hover:border-strong focus-visible:border-accent-coral focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-coral-soft",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
