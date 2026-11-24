"use client";

import type { AgentTraceStep } from "@kanon/core";
import {
  AgentLogList,
  AgentLogRow,
  AgentShimmerText,
  AgentThinking,
  AgentWorkingRow,
  ComposerLoader,
  ProgressBar,
  Spinner,
} from "@kanon/ui";
import { IconCheck } from "@tabler/icons-react";

function TraceTreeCard({ step }: { step: AgentTraceStep }) {
  const isRunning = step.status === "running";
  return (
    <div className="rounded-control border border-hairline bg-surface px-3.5 py-2.5 shadow-card">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex min-w-0 items-center gap-2 font-medium text-ink-primary">
          {isRunning ? (
            <Spinner size="xs" decorative />
          ) : (
            <IconCheck size={13} stroke={1.5} className="shrink-0 text-status-pass" />
          )}
          <span className="truncate">
            {isRunning ? (
              <AgentShimmerText>{`0${step.stepIndex} · ${step.label}`}</AgentShimmerText>
            ) : (
              `0${step.stepIndex} · ${step.label}`
            )}
          </span>
        </span>
        {step.status === "done" ? (
          <span className="shrink-0 font-mono text-ink-muted tabular-nums">
            {step.durationMs}ms
          </span>
        ) : null}
      </div>
      {step.finding ? (
        <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">{step.finding}</p>
      ) : null}
      {step.citation ? (
        <div className="mt-1 truncate font-mono text-xs text-ink-muted">溯源：{step.citation}</div>
      ) : null}
    </div>
  );
}

export function AgentTraceLogSection({
  traces,
  running,
}: {
  traces: readonly AgentTraceStep[];
  running: boolean;
}) {
  const doneCount = traces.filter((t) => t.status === "done").length;
  return (
    <ComposerLoader active={running} radius={20}>
      <div className="rounded-card border border-hairline bg-muted/55 p-3.5 shadow-card">
        <div className="flex items-center justify-between gap-2 px-1">
          {running ? (
            <AgentThinking variant="wave" label="多角色投委会深度审计中" />
          ) : (
            <span className="text-xs font-medium text-ink-secondary">
              审计推理轨迹（{doneCount}/{Math.max(doneCount, 6)} 步）
            </span>
          )}
          <span className="font-mono text-xs text-ink-muted tabular-nums">
            {running ? "LIVE" : "DONE"}
          </span>
        </div>
        <ProgressBar
          value={doneCount}
          max={6}
          indeterminate={running && doneCount === 0}
          tone={running ? "accent" : "pass"}
          size="sm"
          className="mt-2.5 px-1"
        />
        {traces.length > 0 ? (
          <AgentLogList className="mt-3">
            {traces.map((step, idx) => (
              <AgentLogRow key={step.stepIndex} first={idx === 0} last={idx === traces.length - 1}>
                <TraceTreeCard step={step} />
              </AgentLogRow>
            ))}
          </AgentLogList>
        ) : null}
        {running ? <AgentWorkingRow label="正在综合四角色辩论并生成提案" /> : null}
      </div>
    </ComposerLoader>
  );
}
