"use client";

import { Popover } from "@heroui/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface ProvenancePopoverProps {
  children: ReactNode;
  sourceLabel: string;
  periodLabel?: string;
  xbrlTag?: string;
  formula?: string;
  fxNote?: string;
  asOf?: string;
  secUrl?: string;
  className?: string;
}

function ProvenanceMetaRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="truncate text-right font-mono text-ink-primary">{value}</dd>
    </div>
  );
}

export function ProvenancePopover({
  children,
  sourceLabel,
  periodLabel,
  xbrlTag,
  formula,
  fxNote,
  asOf,
  secUrl,
  className,
}: ProvenancePopoverProps) {
  return (
    <Popover>
      <Popover.Trigger<"span">
        render={(triggerProps) => <span {...triggerProps} />}
        className={cn(
          "inline-flex cursor-pointer items-center decoration-strong/70 decoration-dotted underline-offset-4 hover:underline",
          className,
        )}
      >
        {children}
      </Popover.Trigger>
      <Popover.Content placement="top" offset={8} className="z-50 max-w-xs">
        <Popover.Dialog className="p-3.5 focus:outline-none">
          <Popover.Arrow />
          <Popover.Heading className="text-xs font-semibold text-ink-primary">
            数据血缘 · {sourceLabel}
          </Popover.Heading>
          <dl className="mt-2 space-y-1 text-xs leading-relaxed text-ink-secondary">
            <ProvenanceMetaRow label="报告期" value={periodLabel} />
            <ProvenanceMetaRow label="XBRL" value={xbrlTag} />
            <ProvenanceMetaRow label="口径" value={formula} />
            <ProvenanceMetaRow label="汇率" value={fxNote} />
            <ProvenanceMetaRow label="截止" value={asOf} />
          </dl>
          {secUrl ? (
            <a
              href={secUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2.5 inline-block text-xs font-medium text-accent-coral hover:underline"
            >
              打开 SEC 原文 ↗
            </a>
          ) : null}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
