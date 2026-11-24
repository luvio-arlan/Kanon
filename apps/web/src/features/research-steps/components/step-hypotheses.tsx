"use client";

import type { RedTeamReport } from "@kanon/ai";
import type { GlossaryTerm, Hypothesis, HypothesisStatus, ThesisDetail } from "@kanon/core";
import { Badge, Button, Card, cn, Input, Textarea } from "@kanon/ui";
import { IconArrowRight, IconCheck, IconDeviceFloppy, IconFlame } from "@tabler/icons-react";
import { useState } from "react";
import { GlossaryChips } from "@/features/glossary";

export interface StepHypothesesProps {
  thesis: ThesisDetail;
  glossary: readonly GlossaryTerm[];
  saving: boolean;
  redTeamLoading: boolean;
  redTeam: RedTeamReport | null;
  onSave: (hypotheses: [Hypothesis, Hypothesis, Hypothesis]) => Promise<void>;
  onRunRedTeam: () => Promise<void>;
  onPromoteRedTeamRule?: (rule: string) => void;
}

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

interface EditorCardProps {
  index: number;
  item: Hypothesis;
  glossary: readonly GlossaryTerm[];
  onChange: (next: Hypothesis) => void;
}

function HypothesisEditorCard({ index, item, glossary, onChange }: EditorCardProps) {
  return (
    <Card className="space-y-3.5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-ink-primary tabular-nums">
          核心假设 0{index + 1}
        </span>
        <StatusPillGroup
          status={item.status}
          onSelect={(status) => onChange({ ...item, status })}
        />
      </div>
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
    </Card>
  );
}

function RedTeamChallengeRow({
  ch,
  idx,
  onPromoteRule,
}: {
  ch: RedTeamReport["challenges"][number];
  idx: number;
  onPromoteRule?: (rule: string) => void;
}) {
  const variant = ch.severity === "critical" ? "fail" : ch.severity === "high" ? "warn" : "default";
  const label = ch.severity === "critical" ? "致命" : ch.severity === "high" ? "高危" : "中危";
  return (
    <div className="rounded-control border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-ink-primary">
          0{idx + 1}. {ch.question}
        </div>
        <Badge variant={variant}>{label}</Badge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        证伪路径：{ch.falsificationPath}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-xs text-ink-muted">锚点：{ch.sourceAnchor}</div>
        {onPromoteRule ? (
          <button
            type="button"
            onClick={() => onPromoteRule(ch.falsificationPath)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-accent-coral transition-opacity hover:opacity-80"
          >
            <span>带入 Step 5 离场红线</span>
            <IconArrowRight size={13} stroke={1.5} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RedTeamResultCard({
  report,
  onPromoteRule,
}: {
  report: RedTeamReport;
  onPromoteRule?: (rule: string) => void;
}) {
  return (
    <Card tone="titanium" className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-primary">
          红队挑刺 · 苛刻空头反驳（已持久化）
        </h3>
        <Badge variant="fail">Devil&apos;s Advocate</Badge>
      </div>
      <div className="space-y-3">
        {report.challenges.map((ch, idx) => (
          <RedTeamChallengeRow key={ch.id} ch={ch} idx={idx} onPromoteRule={onPromoteRule} />
        ))}
      </div>
    </Card>
  );
}

function StepTwoHeader({ loading, onRun }: { loading: boolean; onRun: () => Promise<void> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-ink-primary">Step 2 · 三条可证伪核心假设</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">
          把看多逻辑收敛为最多 3 条可量化、可证伪的硬指标，用红队空头视角压力测试
        </p>
      </div>
      <Button variant="coral" size="md" disabled={loading} onClick={onRun}>
        <IconFlame size={15} stroke={1.5} />
        <span>{loading ? "空头推演中..." : "红队挑刺"}</span>
      </Button>
    </div>
  );
}

export function StepHypotheses(props: StepHypothesesProps) {
  const [items, setItems] = useState<[Hypothesis, Hypothesis, Hypothesis]>(props.thesis.hypotheses);
  const updateItem = (idx: 0 | 1 | 2, next: Hypothesis) => {
    const copy: [Hypothesis, Hypothesis, Hypothesis] = [...items];
    copy[idx] = next;
    setItems(copy);
  };

  return (
    <div className="space-y-6">
      <StepTwoHeader loading={props.redTeamLoading} onRun={props.onRunRedTeam} />
      <div className="space-y-4">
        {([0, 1, 2] as const).map((idx) => (
          <HypothesisEditorCard
            key={items[idx].id}
            index={idx}
            item={items[idx]}
            glossary={props.glossary}
            onChange={(n) => updateItem(idx, n)}
          />
        ))}
      </div>
      {props.redTeam ? (
        <RedTeamResultCard report={props.redTeam} onPromoteRule={props.onPromoteRedTeamRule} />
      ) : null}
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="md"
          disabled={props.saving}
          onClick={() => props.onSave(items)}
        >
          {props.saving ? (
            <IconCheck size={15} stroke={1.5} />
          ) : (
            <IconDeviceFloppy size={15} stroke={1.5} />
          )}
          <span>{props.saving ? "保存中..." : "保存 3 条核心假设"}</span>
        </Button>
      </div>
    </div>
  );
}
