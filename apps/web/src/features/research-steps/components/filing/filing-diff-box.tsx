"use client";

import type { SecFilingDiff } from "@kanon/core";
import { Button } from "@kanon/ui";
import { IconGitCompare, IconScissors } from "@tabler/icons-react";
import { useState } from "react";

function AddedSnippetRow({
  snippet,
  onClip,
}: {
  snippet: string;
  onClip?: (snippet: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-badge border-l-2 border-status-pass bg-status-pass-soft/35 px-2.5 py-1.5 leading-relaxed text-ink-primary">
      <span>+ {snippet}</span>
      {onClip ? (
        <button
          type="button"
          onClick={() => onClip(snippet)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-badge border border-hairline bg-surface px-1.5 py-0.5 text-xs text-ink-secondary hover:text-ink-primary"
        >
          <IconScissors size={11} stroke={1.5} />
          <span>摘录</span>
        </button>
      ) : null}
    </div>
  );
}

export function FilingDiffBox({
  diff,
  onClipSnippet,
}: {
  diff: SecFilingDiff;
  onClipSnippet?: (snippet: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-control border border-hairline bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-primary">
          <IconGitCompare size={14} stroke={1.5} className="text-accent-coral" />
          <span>{diff.changeSummary}</span>
        </span>
        <Button variant="ghost" size="xs" onClick={() => setOpen((v) => !v)}>
          <span>{open ? "收起对比" : "查看措辞 Diff"}</span>
        </Button>
      </div>
      {open ? (
        <div className="mt-2.5 space-y-2 border-t border-hairline pt-2.5 text-xs">
          {diff.addedSnippets.map((snippet) => (
            <AddedSnippetRow
              key={`add-${snippet.slice(0, 32)}`}
              snippet={snippet}
              onClip={onClipSnippet}
            />
          ))}
          {diff.removedSnippets.map((snippet) => (
            <div
              key={`rem-${snippet.slice(0, 32)}`}
              className="rounded-badge border-l-2 border-status-warn bg-status-warn-soft/35 px-2.5 py-1.5 leading-relaxed text-ink-secondary line-through"
            >
              − {snippet}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
