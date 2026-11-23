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
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <Button
        variant={props.status === "archived_veto" ? "outline" : "coral"}
        size="md"
        disabled={props.saving}
        onClick={props.onToggleArchive}
      >
        {props.status === "archived_veto" ? (
          <>
            <IconRefresh size={15} stroke={1.5} />
            <span>恢复至活跃跟踪</span>
          </>
        ) : (
          <>
            <IconArchive size={15} stroke={1.5} />
            <span>一票否决并放弃观察</span>
          </>
        )}
      </Button>
      <Button
        variant="primary"
        size="md"
        disabled={props.saving || !props.canSave}
        onClick={props.onSave}
      >
        {props.saving ? (
          <IconCheck size={15} stroke={1.5} />
        ) : (
          <IconDeviceFloppy size={15} stroke={1.5} />
        )}
        <span>{props.saving ? "保存中..." : "保存 Step 1 并继续"}</span>
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
  onSave: () => void;
}) {
  return (
    <Card className="space-y-4 p-6">
      <div>
        <label
          htmlFor="thesis-summary"
          className="mb-1.5 block text-sm font-semibold text-ink-primary"
        >
          一句话核心投资论点
        </label>
        <Textarea
          id="thesis-summary"
          value={props.summary}
          onChange={(e) => props.onSummary(e.target.value)}
          placeholder="用一句话讲清：这家公司为什么能持续赚超额利润？"
        />
      </div>
      <div>
        <label
          htmlFor="filter-notes"
          className="mb-1.5 block text-sm font-semibold text-ink-primary"
        >
          商业模式补充笔记
        </label>
        <Textarea
          id="filter-notes"
          value={props.notes}
          onChange={(e) => props.onNotes(e.target.value)}
          placeholder="记录产业链位置、护城河薄弱环节或潜在否决理由..."
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
