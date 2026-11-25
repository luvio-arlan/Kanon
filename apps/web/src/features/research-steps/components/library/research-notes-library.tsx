"use client";

import type { ResearchNote } from "@kanon/core";
import { AgentThinking, Badge, Button, Card, Textarea } from "@kanon/ui";
import { IconPlus, IconScissors, IconSparkles, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { apiCreateResearchNote, apiDeleteResearchNote } from "../../lib/notes-api";
import {
  EMPTY_NOTE_DRAFT,
  NewNoteComposer,
  NOTE_KIND_LABELS,
  type NoteDraft,
} from "./note-composer";

function NoteRowItem({
  note,
  active,
  onSelect,
  onDelete,
}: {
  note: ResearchNote;
  active: boolean;
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
        title="移除"
        className="shrink-0 cursor-pointer rounded-item p-1.5 text-ink-muted hover:bg-status-fail-soft hover:text-status-fail"
      >
        <IconTrash size={13} stroke={1.5} />
      </button>
    </div>
  );
}

function LibraryHeader(p: {
  count: number;
  composerOpen: boolean;
  digestLoading: boolean;
  onToggleComposer: () => void;
  onOpenClipper: () => void;
  onRunDigest: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-4 sm:px-7">
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-primary">
          一手资料与法说会纪要库
        </h3>
        <span className="font-mono text-xs text-ink-muted tabular-nums">{p.count} 篇</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="xs" onClick={p.onToggleComposer}>
          <IconPlus size={13} stroke={1.5} />
          <span>{p.composerOpen ? "收起" : "归档纪要"}</span>
        </Button>
        <Button variant="outline" size="xs" onClick={p.onOpenClipper}>
          <IconScissors size={14} stroke={1.5} />
          <span>原文摘录</span>
        </Button>
        <Button variant="titanium" size="xs" loading={p.digestLoading} onClick={p.onRunDigest}>
          {!p.digestLoading ? <IconSparkles size={14} stroke={1.5} /> : null}
          <span>{p.digestLoading ? "提炼中" : "AI 提炼"}</span>
        </Button>
      </div>
    </div>
  );
}

function NotesListSection(p: {
  notes: readonly ResearchNote[];
  selectedId: string | null;
  activeText: string;
  digestLoading: boolean;
  onSelect: (note: ResearchNote) => void;
  onDelete: (id: string) => void;
  onText: (t: string) => void;
}) {
  return (
    <>
      {p.notes.length > 0 ? (
        <div className="divide-y divide-hairline border-b border-hairline">
          {p.notes.slice(0, 6).map((note) => (
            <NoteRowItem
              key={note.id}
              note={note}
              active={p.selectedId === note.id}
              onSelect={() => p.onSelect(note)}
              onDelete={() => p.onDelete(note.id)}
            />
          ))}
        </div>
      ) : null}
      <div className="space-y-3 px-6 py-4 transition-colors focus-within:bg-canvas/45 sm:px-7">
        {p.digestLoading ? <AgentThinking variant="wave" label="正在提炼核心要点" /> : null}
        <Textarea
          variant="editorial"
          value={p.activeText}
          onChange={(e) => p.onText(e.target.value)}
          placeholder="点击上方已归档纪要或直接粘贴季度电话会原文进行 AI 提炼与划词摘录…"
          className="min-h-[84px]"
        />
      </div>
    </>
  );
}

interface ResearchNotesLibraryProps {
  thesisId: string;
  notes: readonly ResearchNote[];
  activeText: string;
  digestLoading: boolean;
  onNotesChange: (next: ResearchNote[]) => void;
  onActiveTextChange: (text: string) => void;
  onRunDigest: (text?: string) => Promise<void>;
  onOpenClipper: () => void;
}

function useNotesLibraryState(props: ResearchNotesLibraryProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<NoteDraft>(EMPTY_NOTE_DRAFT);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(props.notes[0]?.id ?? null);

  const handleCreate = async () => {
    setSaving(true);
    const created = await apiCreateResearchNote(props.thesisId, draft).finally(() =>
      setSaving(false),
    );
    if (!created) return;
    props.onNotesChange([created, ...props.notes]);
    setSelectedId(created.id);
    props.onActiveTextChange(created.content);
    setDraft(EMPTY_NOTE_DRAFT);
    setComposerOpen(false);
  };
  const handleDelete = async (noteId: string) => {
    if (!(await apiDeleteResearchNote(props.thesisId, noteId))) return;
    props.onNotesChange(props.notes.filter((n) => n.id !== noteId));
    if (selectedId === noteId) setSelectedId(null);
  };
  return {
    composerOpen,
    setComposerOpen,
    draft,
    setDraft,
    saving,
    selectedId,
    setSelectedId,
    handleCreate,
    handleDelete,
  };
}

export function ResearchNotesLibrary(props: ResearchNotesLibraryProps) {
  const s = useNotesLibraryState(props);
  return (
    <Card className="overflow-hidden">
      <LibraryHeader
        count={props.notes.length}
        composerOpen={s.composerOpen}
        digestLoading={props.digestLoading}
        onToggleComposer={() => s.setComposerOpen((v) => !v)}
        onOpenClipper={props.onOpenClipper}
        onRunDigest={() => void props.onRunDigest(props.activeText)}
      />
      {s.composerOpen ? (
        <NewNoteComposer
          draft={s.draft}
          saving={s.saving}
          onPatch={(p) => s.setDraft((prev) => ({ ...prev, ...p }))}
          onSave={s.handleCreate}
          onCancel={() => s.setComposerOpen(false)}
        />
      ) : null}
      <NotesListSection
        notes={props.notes}
        selectedId={s.selectedId}
        activeText={props.activeText}
        digestLoading={props.digestLoading}
        onSelect={(note) => {
          s.setSelectedId(note.id);
          props.onActiveTextChange(note.content);
        }}
        onDelete={(id) => void s.handleDelete(id)}
        onText={props.onActiveTextChange}
      />
    </Card>
  );
}
