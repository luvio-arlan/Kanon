"use client";

import type { GlossaryTerm } from "@kanon/core";
import { GlossaryPopoverCard } from "@kanon/ui";
import { Fragment, useMemo } from "react";

export interface GlossaryTextProps {
  text: string;
  terms: readonly GlossaryTerm[];
  className?: string;
}

interface TextSegment {
  key: string;
  content: string;
  term?: GlossaryTerm;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeText(text: string, terms: readonly GlossaryTerm[]): TextSegment[] {
  if (terms.length === 0) return [{ key: "0", content: text }];
  const termMap = new Map(terms.map((item) => [item.term, item]));
  const pattern = [...terms]
    .map((item) => item.term)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");
  const regex = new RegExp(`(?<![A-Za-z0-9])(${pattern})(?![A-Za-z0-9])`, "g");

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(regex)) {
    const start = match.index ?? 0;
    const matched = match[0];
    if (start > cursor) {
      segments.push({ key: `t-${cursor}`, content: text.slice(cursor, start) });
    }
    segments.push({ key: `g-${start}-${matched}`, content: matched, term: termMap.get(matched) });
    cursor = start + matched.length;
  }
  if (cursor < text.length) {
    segments.push({ key: `t-${cursor}`, content: text.slice(cursor) });
  }
  return segments;
}

export function GlossaryText({ text, terms, className }: GlossaryTextProps) {
  const segments = useMemo(() => tokenizeText(text, terms), [text, terms]);

  return (
    <span className={className}>
      {segments.map((seg) => {
        if (!seg.term) {
          return <Fragment key={seg.key}>{seg.content}</Fragment>;
        }
        return (
          <GlossaryPopoverCard
            key={seg.key}
            triggerText={seg.content}
            heading={`${seg.term.term} · ${seg.term.fullName}`}
            category={seg.term.category}
          >
            <p className="text-ink-primary">{seg.term.plainSummary}</p>
            <div className="rounded-control bg-muted/70 p-2.5">
              <span className="font-medium text-ink-primary">财报视角：</span>
              {seg.term.filingContext}
            </div>
            <p className="text-ink-muted">案例：{seg.term.example}</p>
          </GlossaryPopoverCard>
        );
      })}
    </span>
  );
}
