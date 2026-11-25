import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "default" | "editorial";
}

export function Textarea({ className, variant = "default", ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        variant === "editorial"
          ? [
              "flex min-h-[104px] w-full resize-none border-0 bg-transparent p-0 text-sm leading-[1.75] text-ink-primary shadow-none",
              "placeholder:text-ink-muted/65 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            ]
          : [
              "flex min-h-[108px] w-full resize-none rounded-control border border-hairline bg-canvas/55 px-3.5 py-3 text-sm leading-[1.65] text-ink-primary shadow-input",
              "placeholder:text-ink-muted/80 transition-[border-color,box-shadow,background-color] duration-150 ease-[var(--ease-kanon)] motion-reduce:transition-none",
              "hover:border-strong hover:bg-canvas/80 focus-visible:border-accent-coral focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-coral-soft",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ],
        className,
      )}
      {...props}
    />
  );
}
