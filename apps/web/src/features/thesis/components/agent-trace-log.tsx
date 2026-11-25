"use client";

import type { AgentTraceStep } from "@kanon/core";
import {
  AgentLogList,
  AgentLogRow,
  AgentShimmerText,
  AgentThinking,
  AgentWorkingRow,
  ComposerLoader,
  cn,
  KANON_TRANSITION_FAST,
  Spinner,
} from "@kanon/ui";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

function TraceStepEntry({ step }: { step: AgentTraceStep }) {
  const isRunning = step.status === "running";
  const indexText = String(step.stepIndex).padStart(2, "0");

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono text-xs text-ink-muted tabular-nums">{indexText}</span>
        {isRunning ? <Spinner size="xs" decorative className="text-accent-coral" /> : null}
        <span className="min-w-0 flex-1 font-medium text-ink-primary">
          {isRunning ? <AgentShimmerText>{step.label}</AgentShimmerText> : step.label}
        </span>
      </div>
      {step.finding ? (
        <p className="text-xs leading-[1.7] text-ink-secondary">{step.finding}</p>
      ) : null}
      {step.citation ? (
        <div className="truncate font-mono text-xs text-ink-muted/80">{step.citation}</div>
      ) : null}
    </div>
  );
}

function TraceListBody({
  traces,
  running,
}: {
  traces: readonly AgentTraceStep[];
  running: boolean;
}) {
  return (
    <div>
      {traces.length > 0 ? (
        <AgentLogList>
          {traces.map((step, idx) => (
            <AgentLogRow
              key={step.stepIndex}
              first={idx === 0}
              last={idx === traces.length - 1}
              active={step.status === "running"}
            >
              <TraceStepEntry step={step} />
            </AgentLogRow>
          ))}
        </AgentLogList>
      ) : null}
      {running ? <AgentWorkingRow label="综合辩论并生成修订提案" /> : null}
    </div>
  );
}

function LiveTracePanel({
  traces,
  doneCount,
}: {
  traces: readonly AgentTraceStep[];
  doneCount: number;
}) {
  const total = Math.max(traces.length, 8);
  return (
    <ComposerLoader active radius={14}>
      <div className="rounded-panel border border-hairline bg-surface p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-hairline pb-3.5">
          <AgentThinking variant="wave" label="投委会深度审计中" />
          <span className="font-mono text-xs text-ink-muted tabular-nums">
            {doneCount} / {total}
          </span>
        </div>
        <TraceListBody traces={traces} running />
      </div>
    </ComposerLoader>
  );
}

function TraceDisclosureHeader({
  doneCount,
  expanded,
  onToggle,
}: {
  doneCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors duration-150 ease-[var(--ease-kanon)] hover:bg-muted/35"
    >
      <span className="inline-flex items-center gap-2.5 text-xs font-medium text-ink-primary">
        <IconCheck size={14} stroke={1.5} className="text-status-pass" />
        <span>审计核验轨迹</span>
        <span className="font-mono text-ink-muted tabular-nums">{doneCount} 步</span>
      </span>
      <IconChevronDown
        size={15}
        stroke={1.5}
        className={cn(
          "text-ink-muted transition-transform duration-200 ease-[var(--ease-kanon)]",
          expanded && "rotate-180",
        )}
      />
    </button>
  );
}

export function AgentTraceLogSection({
  traces,
  running,
  collapsedByDefault = false,
}: {
  traces: readonly AgentTraceStep[];
  running: boolean;
  collapsedByDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const doneCount = traces.filter((t) => t.status === "done").length;
  if (running) return <LiveTracePanel traces={traces} doneCount={doneCount} />;

  return (
    <div className="overflow-hidden rounded-panel border border-hairline bg-surface">
      <TraceDisclosureHeader
        doneCount={doneCount}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={KANON_TRANSITION_FAST}
            className="overflow-hidden border-t border-hairline"
          >
            <div className="px-5 py-4">
              <TraceListBody traces={traces} running={false} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
