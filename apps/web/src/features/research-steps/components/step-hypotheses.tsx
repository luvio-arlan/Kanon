"use client";

import type { GlossaryTerm, Hypothesis, RedTeamReport, ThesisDetail } from "@kanon/core";
import { AgentThinking, Button, ComposerLoader, ProgressBar } from "@kanon/ui";
import { IconCheck, IconDeviceFloppy, IconFlame, IconPlus } from "@tabler/icons-react";
import { DraftStatusBar } from "@/shared/components/draft-status-bar";
import { useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";
import { HypothesisEditorCard } from "./hypothesis-editor-card";
import { RedTeamResultCard } from "./red-team-result-card";

export interface StepHypothesesProps {
  thesis: ThesisDetail;
  glossary: readonly GlossaryTerm[];
  saving: boolean;
  redTeamLoading: boolean;
  redTeam: RedTeamReport | null;
  onDirtyChange?: (dirty: boolean, saveAction: (() => Promise<void>) | null) => void;
  onSave: (hypotheses: Hypothesis[]) => Promise<void>;
  onRunRedTeam: () => Promise<void>;
  onPromoteRedTeamRule?: (rule: string) => void;
}

function isHypothesisArray(val: unknown): val is Hypothesis[] {
  return Array.isArray(val) && val.length >= 3 && val.length <= 5;
}

function buildExtraHypothesis(thesisId: string, nextNum: number): Hypothesis {
  return {
    id: `${thesisId}-h${nextNum}-${Date.now().toString(36).slice(-4)}`,
    title: "补充核心增长引擎或竞争格局假设",
    metricLabel: "分部收入 / 份额",
    threshold: "待设定量化红线",
    status: "watching",
    note: "记录未来 2–4 个季度用于验证该前提的一阶财报指标。",
  };
}

function swapItems(prev: Hypothesis[], idx: number, delta: -1 | 1): Hypothesis[] {
  const target = idx + delta;
  if (target < 0 || target >= prev.length) return prev;
  const copy = [...prev];
  const moved = copy[idx];
  const swapped = copy[target];
  if (!moved || !swapped) return prev;
  copy[idx] = swapped;
  copy[target] = moved;
  return copy;
}

function StepTwoHeader({
  count,
  loading,
  onRun,
}: {
  count: number;
  loading: boolean;
  onRun: () => Promise<void>;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="h-[1.5px] w-7 bg-accent-coral" />
          <span className="font-mono text-xs tracking-[0.12em] text-ink-muted">
            STEP 02 · {count} ITEMS
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink-primary">
            核心假设拆解
          </h1>
          <span className="kanon-serif-italic text-2xl">Core Hypotheses</span>
        </div>
      </div>
      <Button variant="coral" size="md" loading={loading} onClick={onRun}>
        {!loading ? <IconFlame size={16} stroke={1.5} /> : null}
        <span>{loading ? "推演中" : "红队挑刺"}</span>
      </Button>
    </header>
  );
}

function StepTwoFooter(props: {
  count: number;
  saving: boolean;
  onAdd: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      {props.count < 5 ? (
        <Button variant="outline" size="md" onClick={props.onAdd}>
          <IconPlus size={15} stroke={1.5} />
          <span>增补第 {props.count + 1} 条假设</span>
        </Button>
      ) : (
        <span className="font-mono text-xs text-ink-muted">5 / 5 核心假设</span>
      )}
      <Button variant="primary" size="lg" disabled={props.saving} onClick={props.onSave}>
        {props.saving ? (
          <IconCheck size={16} stroke={1.5} />
        ) : (
          <IconDeviceFloppy size={16} stroke={1.5} />
        )}
        <span>{props.saving ? "保存中..." : `保存 ${props.count} 条核心假设`}</span>
      </Button>
    </div>
  );
}

function HypothesisListSection(props: {
  items: readonly Hypothesis[];
  glossary: readonly GlossaryTerm[];
  onChange: (idx: number, next: Hypothesis) => void;
  onMove: (idx: number, delta: -1 | 1) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="space-y-4">
      {props.items.map((item, idx) => (
        <HypothesisEditorCard
          key={item.id}
          index={idx}
          total={props.items.length}
          item={item}
          glossary={props.glossary}
          onChange={(n) => props.onChange(idx, n)}
          onMove={(delta) => props.onMove(idx, delta)}
          onRemove={props.items.length > 3 ? () => props.onRemove(idx) : undefined}
        />
      ))}
    </div>
  );
}

export function StepHypotheses(props: StepHypothesesProps) {
  const d = useThesisStepDraft({
    storageKey: `kanon-draft:${props.thesis.id}:step2`,
    serverValue: props.thesis.hypotheses,
    serverVersion: props.thesis.updatedAt,
    canSave: !props.saving,
    onDirtyChange: props.onDirtyChange,
    validateStored: isHypothesisArray,
    onSave: props.onSave,
  });
  const addExtra = () =>
    d.setDraft((prev) => [...prev, buildExtraHypothesis(props.thesis.id, prev.length + 1)]);

  return (
    <div className="space-y-6">
      <DraftStatusBar draft={d} saving={props.saving} />
      <StepTwoHeader
        count={d.draft.length}
        loading={props.redTeamLoading}
        onRun={props.onRunRedTeam}
      />
      <HypothesisListSection
        items={d.draft}
        glossary={props.glossary}
        onChange={(idx, n) => d.setDraft((prev) => prev.map((it, i) => (i === idx ? n : it)))}
        onMove={(idx, delta) => d.setDraft((prev) => swapItems(prev, idx, delta))}
        onRemove={(idx) => d.setDraft((prev) => prev.filter((_, i) => i !== idx))}
      />
      {props.redTeamLoading ? (
        <ComposerLoader active radius={20}>
          <div className="space-y-2.5 rounded-card border border-hairline bg-surface p-4 shadow-card">
            <AgentThinking variant="stars" label="红队空头正在反演核心假设盲区" />
            <ProgressBar indeterminate tone="accent" size="sm" />
          </div>
        </ComposerLoader>
      ) : null}
      {props.redTeam ? (
        <RedTeamResultCard report={props.redTeam} onPromoteRule={props.onPromoteRedTeamRule} />
      ) : null}
      <StepTwoFooter
        count={d.draft.length}
        saving={props.saving}
        onAdd={addExtra}
        onSave={() => void d.save()}
      />
    </div>
  );
}
