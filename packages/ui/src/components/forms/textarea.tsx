import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-[108px] w-full resize-none rounded-control border border-hairline bg-canvas/55 px-3.5 py-3 text-sm leading-[1.65] text-ink-primary shadow-input",
        "placeholder:text-ink-muted/80 transition-[border-color,box-shadow,background-color] duration-150 ease-[var(--ease-kanon)] motion-reduce:transition-none",
        "hover:border-strong hover:bg-canvas/80 focus-visible:border-accent-coral focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-coral-soft",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
