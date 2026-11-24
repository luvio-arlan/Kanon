"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { DotsIndicator, InfinityIndicator, StarsIndicator } from "./agent-thinking-indicators";

export type AgentThinkingVariant = "wave" | "spin" | "stars" | "infinity";
export type AgentThinkingTone = "subtle" | "default" | "primary" | "coral";

export interface AgentThinkingProps {
  variant?: AgentThinkingVariant;
  label?: string;
  tone?: AgentThinkingTone;
  shimmer?: boolean;
  showTimer?: boolean;
  className?: string;
}

const TONE_VARS: Record<AgentThinkingTone, string> = {
  subtle: "var(--ink-muted)",
  default: "var(--ink-secondary)",
  primary: "var(--ink-primary)",
  coral: "var(--accent-coral)",
};

const VARIANT_DEFAULT_TONE: Record<AgentThinkingVariant, AgentThinkingTone> = {
  wave: "coral",
  spin: "default",
  stars: "coral",
  infinity: "primary",
};

function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const id = window.setInterval(() => setElapsed((performance.now() - started) / 1000), 100);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="font-mono text-xs text-ink-muted tabular-nums">{elapsed.toFixed(1)}s</span>
  );
}

export function AgentThinking({
  variant = "wave",
  label = "深度推演中",
  tone,
  shimmer = true,
  showTimer = true,
  className,
}: AgentThinkingProps) {
  const resolvedTone = TONE_VARS[tone ?? VARIANT_DEFAULT_TONE[variant]];
  const style = {
    color: resolvedTone,
    "--kanon-agent-tone": resolvedTone,
  } as CSSProperties;

  return (
    <div role="status" className={cn("inline-flex items-center gap-2.5", className)} style={style}>
      {variant === "wave" || variant === "spin" ? <DotsIndicator variant={variant} /> : null}
      {variant === "stars" ? <StarsIndicator /> : null}
      {variant === "infinity" ? <InfinityIndicator /> : null}
      <span className={cn("text-xs font-medium", shimmer && "kanon-agent-shimmer-text")}>
        {label}
      </span>
      {showTimer ? <ElapsedTimer /> : null}
    </div>
  );
}
