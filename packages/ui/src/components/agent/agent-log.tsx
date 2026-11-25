"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { AgentThinking } from "./agent-thinking";

const SOFT_EASE = [0.22, 1, 0.36, 1] as const;
const ROW_INITIAL = { opacity: 0, height: 0, y: 3 };
const ROW_ANIMATE = { opacity: 1, height: "auto", y: 0 };
const ROW_TRANSITION = {
  height: { duration: 0.26, ease: SOFT_EASE },
  opacity: { duration: 0.28, ease: SOFT_EASE },
  y: { duration: 0.28, ease: SOFT_EASE },
};

function TimelineRail({ last, active }: { last: boolean; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 flex w-4 flex-col items-center"
    >
      <span
        className={cn(
          "mt-2 h-2 w-2 shrink-0 rounded-pill border transition-colors duration-200",
          active ? "border-accent-coral bg-accent-coral" : "border-strong bg-surface",
        )}
      />
      {!last ? <span className="mt-1.5 w-px flex-1 bg-hairline" /> : null}
    </span>
  );
}

export function AgentShimmerText({ children }: { children: string }) {
  return <span className="kanon-agent-shimmer-text font-medium">{children}</span>;
}

export function AgentLogList({ children, className }: { children: ReactNode; className?: string }) {
  return <ol className={cn("relative list-none", className)}>{children}</ol>;
}

export function AgentLogRow({
  first: _first,
  last,
  active,
  className,
  children,
}: {
  first: boolean;
  last: boolean;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.li
      initial={reduce ? false : ROW_INITIAL}
      animate={ROW_ANIMATE}
      transition={ROW_TRANSITION}
      className={cn("relative overflow-hidden pl-7", className)}
    >
      <TimelineRail last={last} active={active} />
      <div className={cn("pt-0.5", last ? "pb-1" : "pb-5")}>{children}</div>
    </motion.li>
  );
}

export function AgentWorkingRow({ label, className }: { label: string; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: SOFT_EASE }}
      className={cn("pt-2", className)}
    >
      <AgentThinking variant="stars" label={label} />
    </motion.div>
  );
}
