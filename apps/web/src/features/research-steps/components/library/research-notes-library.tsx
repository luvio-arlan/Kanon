"use client";

import type { ResearchNote } from "@kanon/core";
import { AgentThinking, Button, Card, Textarea } from "@kanon/ui";
import { IconPlus, IconScissors, IconSparkles } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { apiCreateResearchNote, apiDeleteResearchNote } from "../../lib/notes-api";
import { EMPTY_NOTE_DRAFT, NewNoteComposer, type NoteDraft, NoteRowItem } from "./note-composer";

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

function NotesExpandToggle(p: { total: number; showAll: boolean; onToggle: () => void }) {
  if (p.total <= 6) return null;
  return (
    <div className="px-6 py-2.5 text-center sm:px-7">
      <button
        type="button"
        onClick={p.onToggle}
        className="cursor-pointer text-xs font-medium text-ink-secondary hover:text-ink-primary"
      >
        {p.showAll ? "收起较早纪要" : `展开全部 ${p.total} 篇纪要`}
      </button>
    </div>
  );
}

function NotesListSection(p: {
  notes: readonly ResearchNote[];
  selectedId: string | null;
  deletingIds: readonly string[];
  showAll: boolean;
  activeText: string;
  digestLoading: boolean;
  onToggleShowAll: () => void;
  onSelect: (note: ResearchNote) => void;
  onDelete: (id: string) => void;
  onText: (t: string) => void;
}) {
  const visible = p.showAll ? p.notes : p.notes.slice(0, 6);
  return (
    <>
      {p.notes.length > 0 ? (
        <div className="divide-y divide-hairline border-b border-hairline">
          {visible.map((note) => (
            <NoteRowItem
              key={note.id}
              note={note}
              active={p.selectedId === note.id}
              deleting={p.deletingIds.includes(note.id)}
              onSelect={() => p.onSelect(note)}
              onDelete={() => p.onDelete(note.id)}
            />
          ))}
          <NotesExpandToggle
            total={p.notes.length}
            showAll={p.showAll}
            onToggle={p.onToggleShowAll}
          />
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
  const [showAll, setShowAll] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(props.notes[0]?.id ?? null);
  const notesRef = useRef(props.notes);
  notesRef.current = props.notes;

  const handleCreate = async () => {
    setSaving(true);
    const created = await apiCreateResearchNote(props.thesisId, draft).finally(() =>
      setSaving(false),
    );
    if (!created) return;
    props.onNotesChange([created, ...notesRef.current]);
    setSelectedId(created.id);
    props.onActiveTextChange(created.content);
    setDraft(EMPTY_NOTE_DRAFT);
    setComposerOpen(false);
  };
  const handleDelete = async (noteId: string) => {
    if (deletingIds.includes(noteId)) return;
    setDeletingIds((prev) => [...prev, noteId]);
    try {
      if (!(await apiDeleteResearchNote(props.thesisId, noteId))) return;
      props.onNotesChange(notesRef.current.filter((n) => n.id !== noteId));
      if (selectedId === noteId) setSelectedId(null);
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== noteId));
    }
  };
  return {
    composerOpen,
    setComposerOpen,
    draft,
    setDraft,
    saving,
    showAll,
    setShowAll,
    deletingIds,
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
        deletingIds={s.deletingIds}
        showAll={s.showAll}
        activeText={props.activeText}
        digestLoading={props.digestLoading}
        onToggleShowAll={() => s.setShowAll((v) => !v)}
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
