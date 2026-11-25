"use client";

import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  spotlight?: boolean;
  tone?: "surface" | "titanium" | "muted";
}

function bindSpotlightRef(el: HTMLDivElement | null) {
  if (!el) return;
  let rafId = 0;
  let lastX = 0;
  let lastY = 0;
  const onMove = (event: PointerEvent) => {
    lastX = event.clientX;
    lastY = event.clientY;
    if (rafId !== 0) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${lastX - rect.left}px`);
      el.style.setProperty("--my", `${lastY - rect.top}px`);
    });
  };
  el.addEventListener("pointermove", onMove, { passive: true });
  return () => {
    el.removeEventListener("pointermove", onMove);
    if (rafId !== 0) cancelAnimationFrame(rafId);
  };
}

export function Card({
  className,
  interactive = false,
  spotlight = false,
  tone = "surface",
  ...props
}: CardProps) {
  return (
    <div
      ref={spotlight ? bindSpotlightRef : undefined}
      className={cn(
        "kanon-surface-specular rounded-card border border-hairline transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        tone === "surface" && "bg-surface",
        tone === "titanium" && "bg-titanium-subtle",
        tone === "muted" && "bg-muted/75",
        interactive && "hover:border-strong hover:shadow-card-hover",
        spotlight && "kanon-spotlight-surface",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-t border-hairline px-6 py-4",
        className,
      )}
      {...props}
    />
  );
}
