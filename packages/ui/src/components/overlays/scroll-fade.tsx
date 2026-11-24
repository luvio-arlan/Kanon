"use client";

import { type UIEvent, useCallback, useState } from "react";
import { cn } from "../../lib/cn";

export const SCROLL_FADE_DISTANCE = 24;

export function useScrollFade(distance = SCROLL_FADE_DISTANCE) {
  const [progress, setProgress] = useState(0);
  const onScroll = useCallback(
    (event: UIEvent<HTMLElement>) => {
      const top = Math.max(0, event.currentTarget.scrollTop);
      setProgress(Math.min(1, top / distance));
    },
    [distance],
  );
  const reset = useCallback(() => setProgress(0), []);
  return { progress, onScroll, reset };
}

export interface ScrollFadeProps {
  progress: number;
  surfaceClassName?: string;
  className?: string;
}

export function ScrollFade({
  progress,
  surfaceClassName = "from-surface-elevated",
  className,
}: ScrollFadeProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-x-0 top-0 z-10 h-6", className)}
    >
      <div
        className="absolute inset-0 backdrop-blur-[1px] [mask-image:linear-gradient(to_bottom,var(--ink-primary),transparent)]"
        style={{ opacity: progress }}
      />
      <div
        className="absolute inset-x-0 top-0 h-4 backdrop-blur-[4px] [mask-image:linear-gradient(to_bottom,var(--ink-primary),transparent)]"
        style={{ opacity: progress }}
      />
      <div
        className={cn("absolute inset-0 bg-linear-to-b to-transparent", surfaceClassName)}
        style={{ opacity: progress }}
      />
    </div>
  );
}
