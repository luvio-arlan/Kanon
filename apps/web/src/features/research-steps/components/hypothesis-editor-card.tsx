"use client";

import type { GlossaryTerm, Hypothesis, HypothesisStatus } from "@kanon/core";
import {
  ButtonGroup,
  ButtonGroupItem,
  type ButtonGroupTone,
  Card,
  Input,
  Textarea,
} from "@kanon/ui";
import { IconArrowDown, IconArrowUp, IconTrash } from "@tabler/icons-react";
import { GlossaryChips } from "@/features/glossary";

const STATUS_OPTS: ReadonlyArray<{ id: HypothesisStatus; label: string; tone: ButtonGroupTone }> = [
  { id: "validated", label: "已验证", tone: "pass" },
  { id: "watching", label: "待观察", tone: "warn" },
  { id: "warning", label: "证伪预警", tone: "fail" },
];

function StatusButtonGroup({
  status,
  onSelect,
}: {
  status: HypothesisStatus;
  onSelect: (next: HypothesisStatus) => void;
}) {
  return (
    <ButtonGroup ariaLabel="假设验证状态">
      {STATUS_OPTS.map((opt) => (
        <ButtonGroupItem
          key={opt.id}
          size="sm"
          tone={opt.tone}
          showDot
          selected={status === opt.id}
          onClick={() => onSelect(opt.id)}
        >
          {opt.label}
        </ButtonGroupItem>
      ))}
    </ButtonGroup>
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
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary disabled:opacity-30"
      >
        <IconArrowUp size={15} stroke={1.5} />
      </button>
      <button
        type="button"
        disabled={props.index === props.total - 1}
        onClick={() => props.onMove(1)}
        title="下移优先级"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary disabled:opacity-30"
      >
        <IconArrowDown size={15} stroke={1.5} />
      </button>
      {props.onRemove ? (
        <button
          type="button"
          onClick={props.onRemove}
          title="移除此条假设"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-status-fail-soft hover:text-status-fail"
        >
          <IconTrash size={15} stroke={1.5} />
        </button>
      ) : null}
    </div>
  );
}

function MetricInputsRow({
  item,
  onChange,
}: {
  item: Hypothesis;
  onChange: (next: Hypothesis) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-ink-muted">关键观测指标</div>
        <Input
          value={item.metricLabel}
          onChange={(e) => onChange({ ...item, metricLabel: e.target.value })}
          placeholder="例如：数据中心营收增速"
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-ink-muted">证伪红线阈值</div>
        <Input
          value={item.threshold}
          onChange={(e) => onChange({ ...item, threshold: e.target.value })}
          placeholder="例如：连续两季低于 20%"
          className="font-mono tabular-nums"
        />
      </div>
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
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-ink-muted">核心前提陈述</div>
        <Input
          value={item.title}
          onChange={(e) => onChange({ ...item, title: e.target.value })}
          placeholder="写出必须成立的核心前提..."
          className="text-[15px] font-medium"
        />
      </div>
      <MetricInputsRow item={item} onChange={onChange} />
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-ink-muted">财报佐证与追踪备注</div>
        <Textarea
          value={item.note}
          onChange={(e) => onChange({ ...item, note: e.target.value })}
          placeholder="记录最新财报佐证或证伪信号..."
          className="min-h-[88px]"
        />
      </div>
      <GlossaryChips text={`${item.title} ${item.metricLabel} ${item.note}`} terms={glossary} />
    </div>
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
    <Card className="space-y-5 p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold tracking-wide text-ink-primary tabular-nums">
            HYPOTHESIS 0{index + 1}
          </span>
          <ReorderActions
            index={index}
            total={total}
            onMove={props.onMove}
            onRemove={props.onRemove}
          />
        </div>
        <StatusButtonGroup
          status={item.status}
          onSelect={(status) => onChange({ ...item, status })}
        />
      </div>
      <HypothesisCardFields item={item} glossary={glossary} onChange={onChange} />
    </Card>
  );
}
