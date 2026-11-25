"use client";

import type { ThesisStatus } from "@kanon/core";
import { Button, Card, Textarea } from "@kanon/ui";
import { IconArchive, IconCheck, IconDeviceFloppy, IconRefresh } from "@tabler/icons-react";

function FilterActionsBar(props: {
  status: ThesisStatus;
  saving: boolean;
  canSave: boolean;
  onToggleArchive: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
      <Button
        variant={props.status === "archived_veto" ? "outline" : "danger"}
        size="md"
        disabled={props.saving}
        onClick={props.onToggleArchive}
      >
        {props.status === "archived_veto" ? (
          <>
            <IconRefresh size={16} stroke={1.5} />
            <span>恢复至活跃跟踪</span>
          </>
        ) : (
          <>
            <IconArchive size={16} stroke={1.5} />
            <span>暂不纳入并归档</span>
          </>
        )}
      </Button>
      <Button
        variant="primary"
        size="lg"
        disabled={props.saving || !props.canSave}
        onClick={props.onSave}
      >
        {props.saving ? (
          <IconCheck size={16} stroke={1.5} />
        ) : (
          <IconDeviceFloppy size={16} stroke={1.5} />
        )}
        <span>{props.saving ? "保存中..." : "保存 Step 1"}</span>
      </Button>
    </div>
  );
}

function NotesField(p: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <label htmlFor={p.id} className="block text-sm font-semibold text-ink-primary">
        {p.label}
      </label>
      <Textarea
        id={p.id}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        placeholder={p.placeholder}
        className="min-h-[124px]"
      />
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
  onSave: () => void;
}) {
  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <NotesField
          id="thesis-summary"
          label="核心投资论点"
          value={props.summary}
          onChange={props.onSummary}
          placeholder="凝练阐述：这家公司为何能持续创造超额资本回报？"
        />
        <NotesField
          id="filter-notes"
          label="商业质量补充研判"
          value={props.notes}
          onChange={props.onNotes}
          placeholder="记录产业链地位、竞争壁垒薄弱环节或潜在排除理由..."
        />
      </div>
      <FilterActionsBar
        status={props.status}
        saving={props.saving}
        canSave={Boolean(props.summary.trim())}
        onToggleArchive={props.onToggleArchive}
        onSave={props.onSave}
      />
    </Card>
  );
}
