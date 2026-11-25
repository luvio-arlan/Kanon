"use client";

import type { SavedAgentRun } from "@kanon/core";
import { cn } from "@kanon/ui";

export function AgentHistoryBar({
  runs,
  activeRunId,
  onSelect,
}: {
  runs: readonly SavedAgentRun[];
  activeRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  if (runs.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-1">
      <span className="mr-1 text-xs text-ink-muted">历史审计</span>
      {runs.map((run, idx) => {
        const active = run.id === activeRunId;
        const dateLabel = run.createdAt.slice(5, 16).replace("T", " ");
        return (
          <button
            key={run.id}
            type="button"
            onClick={() => onSelect(run.id)}
            className={cn(
              "cursor-pointer rounded-pill border px-2.5 py-1 font-mono text-xs tabular-nums transition-colors",
              active
                ? "border-strong bg-titanium font-medium text-ink-primary"
                : "border-hairline bg-surface text-ink-muted hover:border-strong hover:text-ink-primary",
            )}
          >
            {idx === 0 ? "最新" : dateLabel} · {run.briefing.convictionScore}分
          </button>
        );
      })}
    </div>
  );
}
