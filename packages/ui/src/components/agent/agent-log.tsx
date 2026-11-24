"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { AgentThinking } from "./agent-thinking";

const SOFT_EASE = [0.22, 1, 0.36, 1] as const;
const BRANCH_Y = 14;
const BRANCH_RADIUS = 6;
const BRANCH_WIDTH = 12;
const BRANCH_PATH = `M0.5 0 V${BRANCH_Y - BRANCH_RADIUS} Q0.5 ${BRANCH_Y} ${0.5 + BRANCH_RADIUS} ${BRANCH_Y} H11.5`;

const ROW_INITIAL = { opacity: 0, height: 0, y: 4 };
const ROW_ANIMATE = { opacity: 1, height: "auto", y: 0 };
const ROW_TRANSITION = {
  height: { duration: 0.3, ease: SOFT_EASE },
  opacity: { duration: 0.34, ease: SOFT_EASE },
  y: { duration: 0.34, ease: SOFT_EASE },
};

const TAIL_TRANSITION = { duration: 0.12, ease: "linear" as const };

function RowConnector({ first, last, reduce }: { first: boolean; last: boolean; reduce: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 w-3 text-strong"
    >
      <svg
        width={BRANCH_WIDTH}
        height={BRANCH_Y + 1}
        viewBox={`0 0 ${BRANCH_WIDTH} ${BRANCH_Y + 1}`}
        fill="none"
        aria-hidden="true"
        className="absolute left-0 top-0"
      >
        <motion.path
          d={BRANCH_PATH}
          stroke="currentColor"
          strokeWidth="1"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.14, ease: "linear", delay: first ? 0 : 0.12 }}
        />
      </svg>
      {!last ? (
        <motion.span
          className="absolute left-0 w-px origin-top bg-current"
          style={{ top: BRANCH_Y - BRANCH_RADIUS, bottom: 0 }}
          initial={reduce ? false : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={TAIL_TRANSITION}
        />
      ) : null}
    </span>
  );
}

export function AgentShimmerText({ children }: { children: string }) {
  return <span className="kanon-agent-shimmer-text font-medium">{children}</span>;
}

export function AgentLogList({ children, className }: { children: ReactNode; className?: string }) {
  return <ol className={cn("relative ml-1.5 list-none", className)}>{children}</ol>;
}

export function AgentLogRow({
  first,
  last,
  className,
  children,
}: {
  first: boolean;
  last: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.li
      initial={reduce ? false : ROW_INITIAL}
      animate={ROW_ANIMATE}
      transition={ROW_TRANSITION}
      className={cn("relative overflow-hidden pl-4", className)}
    >
      <RowConnector first={first} last={last} reduce={reduce} />
      <div className="pb-2.5 pt-1">{children}</div>
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
      className={cn("px-1 py-2", className)}
    >
      <AgentThinking variant="stars" label={label} />
    </motion.div>
  );
}
