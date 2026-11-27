"use client";

import type {
  CrossCheck,
  GlossaryTerm,
  Hypothesis,
  HypothesisStatus,
  SecAnnualFinancial,
  SecQuarterlyFinancial,
} from "@kanon/core";
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
import { HypothesisKpiStrip } from "./lineage/hypothesis-kpi-strip";
import { HypothesisLinkedEvidence } from "./lineage/hypothesis-link-controls";

const STATUS_OPTS: ReadonlyArray<{ id: HypothesisStatus; label: string; tone: ButtonGroupTone }> = [
  { id: "validated", label: "已验证", tone: "pass" },
  { id: "watching", label: "待观察", tone: "warn" },
  { id: "warning", label: "证伪预警", tone: "fail" },
  { id: "invalidated", label: "已证伪", tone: "fail" },
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
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/hyp:opacity-100 [@media(hover:none)]:opacity-100">
      <button
        type="button"
        disabled={props.index === 0}
        onClick={() => props.onMove(-1)}
        title="上移"
        aria-label="上移核心假设"
        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-item text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary disabled:opacity-30"
      >
        <IconArrowUp size={14} stroke={1.5} />
      </button>
      <button
        type="button"
        disabled={props.index === props.total - 1}
        onClick={() => props.onMove(1)}
        title="下移"
        aria-label="下移核心假设"
        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-item text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary disabled:opacity-30"
      >
        <IconArrowDown size={14} stroke={1.5} />
      </button>
      {props.onRemove ? (
        <button
          type="button"
          onClick={props.onRemove}
          title="移除"
          aria-label="移除核心假设"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-item text-ink-muted transition-colors hover:bg-status-fail-soft hover:text-status-fail"
        >
          <IconTrash size={14} stroke={1.5} />
        </button>
      ) : null}
    </div>
  );
}

function MetricStrip({
  item,
  onChange,
}: {
  item: Hypothesis;
  onChange: (next: Hypothesis) => void;
}) {
  return (
    <div className="grid grid-cols-1 divide-y divide-hairline border-b border-hairline bg-canvas/35 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
      <div className="px-6 py-3.5 transition-colors focus-within:bg-surface/85 sm:px-7">
        <div className="mb-1 text-xs text-ink-muted">观测指标</div>
        <Input
          variant="editorial"
          value={item.metricLabel}
          onChange={(e) => onChange({ ...item, metricLabel: e.target.value })}
          placeholder="例如：数据中心营收增速"
        />
      </div>
      <div className="px-6 py-3.5 transition-colors focus-within:bg-surface/85 sm:px-7">
        <div className="mb-1 text-xs text-ink-muted">证伪阈值</div>
        <Input
          variant="editorial"
          value={item.threshold}
          onChange={(e) => onChange({ ...item, threshold: e.target.value })}
          placeholder="例如：连续两季低于 20%"
          className="font-mono tabular-nums"
        />
      </div>
    </div>
  );
}

function HypothesisHeaderRow(p: {
  index: number;
  total: number;
  item: Hypothesis;
  onChange: (next: Hypothesis) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-4 transition-colors focus-within:bg-canvas/35 sm:px-7">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 font-mono text-xs text-ink-muted tabular-nums">
          {String(p.index + 1).padStart(2, "0")}
        </span>
        <Input
          variant="editorial"
          value={p.item.title}
          onChange={(e) => p.onChange({ ...p.item, title: e.target.value })}
          placeholder="核心前提陈述…"
          className="text-[15px] font-semibold tracking-[-0.01em]"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ReorderActions index={p.index} total={p.total} onMove={p.onMove} onRemove={p.onRemove} />
        <StatusButtonGroup
          status={p.item.status}
          onSelect={(status) => p.onChange({ ...p.item, status })}
        />
      </div>
    </div>
  );
}

export function HypothesisEditorCard(props: {
  index: number;
  total: number;
  item: Hypothesis;
  glossary: readonly GlossaryTerm[];
  annuals?: readonly SecAnnualFinancial[];
  quarterlies?: readonly SecQuarterlyFinancial[];
  linkedChecks?: readonly CrossCheck[];
  onChange: (next: Hypothesis) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove?: () => void;
}) {
  const { item, glossary, annuals = [], quarterlies = [], linkedChecks = [], onChange } = props;
  return (
    <Card className="group/hyp overflow-hidden">
      <HypothesisHeaderRow {...props} />
      <MetricStrip item={item} onChange={onChange} />
      <div className="space-y-3 px-6 py-4 transition-colors focus-within:bg-canvas/35 sm:px-7">
        <Textarea
          variant="editorial"
          value={item.note}
          onChange={(e) => onChange({ ...item, note: e.target.value })}
          placeholder="记录财报佐证或证伪信号…"
          className="min-h-[68px]"
        />
        <GlossaryChips text={`${item.title} ${item.metricLabel} ${item.note}`} terms={glossary} />
      </div>
      <HypothesisKpiStrip
        item={item}
        annuals={annuals}
        quarterlies={quarterlies}
        onChange={onChange}
      />
      <HypothesisLinkedEvidence checks={linkedChecks} />
    </Card>
  );
}
