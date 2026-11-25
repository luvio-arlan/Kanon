"use client";

import { motion } from "framer-motion";
import { cn } from "../../lib/cn";
import { KANON_SPRING } from "../../lib/motion";

export interface ReadinessRingProps {
  scorePct: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}

function RingGraphic(props: {
  size: number;
  strokeWidth: number;
  radius: number;
  circumference: number;
  dashOffset: number;
  complete: boolean;
}) {
  const half = props.size / 2;
  return (
    <svg
      width={props.size}
      height={props.size}
      viewBox={`0 0 ${props.size} ${props.size}`}
      aria-hidden="true"
      className="-rotate-90 shrink-0"
    >
      <circle
        cx={half}
        cy={half}
        r={props.radius}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth={props.strokeWidth}
      />
      <motion.circle
        cx={half}
        cy={half}
        r={props.radius}
        fill="none"
        stroke={props.complete ? "var(--status-pass)" : "var(--ink-primary)"}
        strokeWidth={props.strokeWidth}
        strokeLinecap="round"
        strokeDasharray={props.circumference}
        initial={false}
        animate={{ strokeDashoffset: props.dashOffset }}
        transition={KANON_SPRING}
      />
    </svg>
  );
}

export function ReadinessRing({
  scorePct,
  size = 24,
  strokeWidth = 2,
  label,
  className,
}: ReadinessRingProps) {
  const clamped = Math.min(100, Math.max(0, scorePct));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const accessibleLabel = label ?? `研究成熟度 ${clamped}%`;
  return (
    <span
      role="img"
      aria-label={accessibleLabel}
      className={cn("inline-flex items-center gap-1.5", className)}
      title={accessibleLabel}
    >
      <RingGraphic
        size={size}
        strokeWidth={strokeWidth}
        radius={radius}
        circumference={circumference}
        dashOffset={circumference * (1 - clamped / 100)}
        complete={clamped >= 85}
      />
      {label ? (
        <span className="font-mono text-xs text-ink-secondary tabular-nums">{label}</span>
      ) : null}
    </span>
  );
}
