"use client";

import type { GlossaryTerm } from "@kanon/core";
import { GlossaryPopoverCard } from "@kanon/ui";
import { useMemo } from "react";

export interface GlossaryChipsProps {
  text: string;
  terms: readonly GlossaryTerm[];
}

export function GlossaryChips({ text, terms }: GlossaryChipsProps) {
  const matched = useMemo(() => {
    const lower = text.toLowerCase();
    return terms.filter((item) => lower.includes(item.term.toLowerCase()));
  }, [text, terms]);

  if (matched.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="text-xs text-ink-muted">涉及术语：</span>
      {matched.map((entry) => (
        <GlossaryPopoverCard
          key={entry.term}
          triggerText={entry.term}
          heading={`${entry.term} · ${entry.fullName}`}
          category={entry.category}
          className="rounded-pill border border-hairline bg-muted/60 px-2 py-0.5 text-xs no-underline hover:border-accent-coral/40"
        >
          <p className="text-ink-primary">{entry.plainSummary}</p>
          <div className="rounded-control bg-muted/70 p-2.5">
            <span className="font-medium text-ink-primary">财报视角：</span>
            {entry.filingContext}
          </div>
          <p className="text-ink-muted">案例：{entry.example}</p>
        </GlossaryPopoverCard>
      ))}
    </div>
  );
}
