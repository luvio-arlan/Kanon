"use client";

import type { GlossaryTerm, Hypothesis, HypothesisStatus } from "@kanon/core";
import { Card, cn, Input, Textarea } from "@kanon/ui";
import { IconArrowDown, IconArrowUp, IconTrash } from "@tabler/icons-react";
import { GlossaryChips } from "@/features/glossary";

const STATUS_OPTS: ReadonlyArray<{ id: HypothesisStatus; label: string; active: string }> = [
  {
    id: "validated",
    label: "已验证",
    active: "border-status-pass bg-status-pass-soft text-status-pass",
  },
  {
    id: "watching",
    label: "待观察",
    active: "border-status-warn bg-status-warn-soft text-status-warn",
  },
  {
    id: "warning",
    label: "证伪预警",
    active: "border-status-fail bg-status-fail-soft text-status-fail",
  },
];

function StatusPillGroup({
  status,
  onSelect,
}: {
  status: HypothesisStatus;
  onSelect: (next: HypothesisStatus) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {STATUS_OPTS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onSelect(opt.id)}
          className={cn(
            "cursor-pointer rounded-pill border px-3 py-1 text-xs font-medium transition-colors",
            status === opt.id
              ? opt.active
              : "border-hairline bg-surface text-ink-secondary hover:border-strong",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ReorderActions(props: {
  index: number;
  total: number;
  onMove: (delta: -1 | 1) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={props.index === 0}
        onClick={() => props.onMove(-1)}
        title="上移优先级"
        className="cursor-pointer rounded-control p-1 text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary disabled:opacity-30"
      >
        <IconArrowUp size={13} stroke={1.5} />
      </button>
      <button
        type="button"
        disabled={props.index === props.total - 1}
        onClick={() => props.onMove(1)}
        title="下移优先级"
        className="cursor-pointer rounded-control p-1 text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary disabled:opacity-30"
      >
        <IconArrowDown size={13} stroke={1.5} />
      </button>
      {props.onRemove ? (
        <button
          type="button"
          onClick={props.onRemove}
          title="移除此条假设"
          className="cursor-pointer rounded-control p-1 text-ink-muted transition-colors hover:bg-status-fail-soft hover:text-status-fail"
        >
          <IconTrash size={13} stroke={1.5} />
        </button>
      ) : null}
    </div>
  );
}

function HypothesisCardFields({
  item,
  glossary,
  onChange,
}: {
  item: Hypothesis;
  glossary: readonly GlossaryTerm[];
  onChange: (next: Hypothesis) => void;
}) {
  return (
    <>
      <Input
        value={item.title}
        onChange={(e) => onChange({ ...item, title: e.target.value })}
        placeholder="写出必须成立的核心前提..."
        className="font-medium"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          value={item.metricLabel}
          onChange={(e) => onChange({ ...item, metricLabel: e.target.value })}
          placeholder="关键观测指标"
        />
        <Input
          value={item.threshold}
          onChange={(e) => onChange({ ...item, threshold: e.target.value })}
          placeholder="证伪红线阈值"
          className="font-mono tabular-nums"
        />
      </div>
      <Textarea
        value={item.note}
        onChange={(e) => onChange({ ...item, note: e.target.value })}
        placeholder="最新财报佐证或证伪说明..."
        className="min-h-[72px]"
      />
      <GlossaryChips text={`${item.title} ${item.metricLabel} ${item.note}`} terms={glossary} />
    </>
  );
}

export function HypothesisEditorCard(props: {
  index: number;
  total: number;
  item: Hypothesis;
  glossary: readonly GlossaryTerm[];
  onChange: (next: Hypothesis) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove?: () => void;
}) {
  const { index, total, item, glossary, onChange } = props;
  return (
    <Card className="space-y-3.5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-ink-primary tabular-nums">
            核心假设 0{index + 1}
          </span>
          <ReorderActions
            index={index}
            total={total}
            onMove={props.onMove}
            onRemove={props.onRemove}
          />
        </div>
        <StatusPillGroup
          status={item.status}
          onSelect={(status) => onChange({ ...item, status })}
        />
      </div>
      <HypothesisCardFields item={item} glossary={glossary} onChange={onChange} />
    </Card>
  );
}
