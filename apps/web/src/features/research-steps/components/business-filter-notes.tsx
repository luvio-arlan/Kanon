"use client";

import type { ThesisStatus } from "@kanon/core";
import { Button, Card, Textarea } from "@kanon/ui";
import { IconArchive, IconRefresh } from "@tabler/icons-react";

function NotesEditorialCell(p: {
  id: string;
  code: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="group/cell flex flex-col p-6 transition-colors duration-200 ease-[var(--ease-kanon)] focus-within:bg-canvas/45 sm:p-7">
      <label htmlFor={p.id} className="mb-3 inline-flex items-center gap-2.5">
        <span className="font-mono text-xs text-ink-muted tabular-nums">{p.code}</span>
        <span className="text-sm font-semibold tracking-[-0.01em] text-ink-primary">{p.label}</span>
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-pill bg-accent-coral opacity-0 transition-opacity duration-200 group-focus-within/cell:opacity-100"
        />
      </label>
      <Textarea
        id={p.id}
        variant="editorial"
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        placeholder={p.placeholder}
        className="min-h-[112px]"
      />
    </div>
  );
}

function ArchiveFooterAction(props: {
  status: ThesisStatus;
  saving: boolean;
  onToggleArchive: () => void;
}) {
  return (
    <div className="flex items-center justify-end border-t border-hairline px-6 py-3 sm:px-7">
      <Button
        variant="ghost"
        size="xs"
        disabled={props.saving}
        onClick={props.onToggleArchive}
        className={
          props.status === "archived_veto"
            ? "text-ink-secondary hover:text-ink-primary"
            : "text-ink-muted hover:text-status-fail"
        }
      >
        {props.status === "archived_veto" ? (
          <>
            <IconRefresh size={14} stroke={1.5} />
            <span>恢复至活跃跟踪</span>
          </>
        ) : (
          <>
            <IconArchive size={14} stroke={1.5} />
            <span>暂不纳入并归档</span>
          </>
        )}
      </Button>
    </div>
  );
}

export function BusinessFilterNotesCard(props: {
  status: ThesisStatus;
  summary: string;
  notes: string;
  saving: boolean;
  onSummary: (next: string) => void;
  onNotes: (next: string) => void;
  onToggleArchive: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 divide-y divide-hairline lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <NotesEditorialCell
          id="thesis-summary"
          code="01"
          label="核心投资论点"
          value={props.summary}
          onChange={props.onSummary}
          placeholder="凝练阐述这家公司持续创造超额资本回报的核心来源…"
        />
        <NotesEditorialCell
          id="filter-notes"
          code="02"
          label="补充研判"
          value={props.notes}
          onChange={props.onNotes}
          placeholder="记录产业链地位、壁垒薄弱环节或潜在风险…"
        />
      </div>
      <ArchiveFooterAction
        status={props.status}
        saving={props.saving}
        onToggleArchive={props.onToggleArchive}
      />
    </Card>
  );
}
