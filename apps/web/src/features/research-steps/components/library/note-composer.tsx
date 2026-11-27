"use client";

import type { ResearchNote, ResearchNoteKind } from "@kanon/core";
import { ActionMenu, Badge, Button, Input, Textarea } from "@kanon/ui";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";

export const NOTE_KIND_LABELS: Record<ResearchNoteKind, string> = {
  earnings_call: "法说会",
  filing_note: "年季报附注",
  channel_check: "渠道调研",
  guidance_log: "指引兑现",
};

export interface NoteDraft {
  kind: ResearchNoteKind;
  periodLabel: string;
  title: string;
  content: string;
}

export const EMPTY_NOTE_DRAFT: NoteDraft = {
  kind: "earnings_call",
  periodLabel: `FY${String(new Date().getFullYear()).slice(-2)} Q${Math.ceil((new Date().getMonth() + 1) / 3)}`,
  title: "",
  content: "",
};

function NoteMetaRow({
  draft,
  onPatch,
}: {
  draft: NoteDraft;
  onPatch: (p: Partial<NoteDraft>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionMenu
        ariaLabel="资料类型"
        triggerClassName="inline-flex h-8 items-center gap-1.5 rounded-control border border-hairline bg-surface px-2.5 text-xs text-ink-primary hover:border-strong"
        trigger={
          <>
            <span>{NOTE_KIND_LABELS[draft.kind]}</span>
            <IconChevronDown size={12} stroke={1.5} className="kanon-chevron text-ink-muted" />
          </>
        }
        items={(Object.keys(NOTE_KIND_LABELS) as ResearchNoteKind[]).map((k) => ({
          id: k,
          label: NOTE_KIND_LABELS[k],
          selected: draft.kind === k,
          onSelect: () => onPatch({ kind: k }),
        }))}
      />
      <Input
        value={draft.periodLabel}
        onChange={(e) => onPatch({ periodLabel: e.target.value })}
        placeholder="季度如 FY26 Q2"
        className="h-8 w-28 font-mono text-xs"
      />
      <Input
        value={draft.title}
        onChange={(e) => onPatch({ title: e.target.value })}
        placeholder="标题（如：云业务毛利与 CapEx 指引）"
        className="h-8 min-w-[200px] flex-1 text-xs"
      />
    </div>
  );
}

export function NewNoteComposer({
  draft,
  saving,
  onPatch,
  onSave,
  onCancel,
}: {
  draft: NoteDraft;
  saving: boolean;
  onPatch: (p: Partial<NoteDraft>) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 border-b border-hairline bg-canvas/35 px-6 py-5 sm:px-7">
      <NoteMetaRow draft={draft} onPatch={onPatch} />
      <Textarea
        variant="editorial"
        value={draft.content}
        onChange={(e) => onPatch({ content: e.target.value })}
        placeholder="粘贴电话会问答、管理层原话或 10-K 附注摘录…"
        className="min-h-[92px]"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="xs" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="primary"
          size="xs"
          loading={saving}
          disabled={!draft.title.trim() || !draft.content.trim()}
          onClick={() => void onSave()}
        >
          归档保存
        </Button>
      </div>
    </div>
  );
}

export function NoteRowItem({
  note,
  active,
  deleting,
  onSelect,
  onDelete,
}: {
  note: ResearchNote;
  active: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-6 py-3.5 transition-colors hover:bg-canvas/45 sm:px-7">
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 cursor-pointer text-left">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={active ? "coral" : "titanium"}>{NOTE_KIND_LABELS[note.kind]}</Badge>
          <span className="font-mono text-xs text-ink-muted">{note.periodLabel}</span>
          <span className="truncate text-sm font-medium text-ink-primary">{note.title}</span>
        </div>
        {note.guidancePromised ? (
          <div className="mt-1 font-mono text-xs text-ink-secondary">
            {note.guidanceMetric || "指引"}：承诺 {note.guidancePromised} → 兑现{" "}
            {note.guidanceDelivered || "待验证"}
          </div>
        ) : null}
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-secondary">
          {note.content}
        </p>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        title="移除"
        aria-label={`移除纪要 ${note.title}`}
        className="shrink-0 cursor-pointer rounded-item p-1.5 text-ink-muted hover:bg-status-fail-soft hover:text-status-fail disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconTrash size={13} stroke={1.5} />
      </button>
    </div>
  );
}
