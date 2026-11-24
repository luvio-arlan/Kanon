"use client";

import type { AgentBriefing, AgentProposal, AgentTraceStep } from "@kanon/core";
import { Badge, Button, KANON_TRANSITION_FAST, Sheet } from "@kanon/ui";
import {
  IconCheck,
  IconChecks,
  IconLoader2,
  IconPlayerPlay,
  IconSparkles,
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { AgentBriefingCard } from "./agent-briefing-card";

export interface AgentResearchSheetProps {
  open: boolean;
  ticker: string;
  companyName: string;
  running: boolean;
  traces: readonly AgentTraceStep[];
  briefing: AgentBriefing | null;
  appliedIds: readonly string[];
  onOpenChange: (open: boolean) => void;
  onRun: () => Promise<void>;
  onApplyProposal: (proposal: AgentProposal) => Promise<void>;
}

const TARGET_LABELS: Record<AgentProposal["target"], string> = {
  variant_perception: "写入 Step 1 · 预期差",
  key_debate: "写入 Step 1 · 核心争论",
  pre_mortem: "写入 Step 1 · 事前验尸",
  hypothesis_update: "修订 Step 2 · 核心假设",
  cross_check_draft: "增补 Step 3 · 产业链互证",
  exit_rule: "带入 Step 5 · 离场红线",
};

function TraceStepItem({ step }: { step: AgentTraceStep }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={KANON_TRANSITION_FAST}
      className="rounded-control border border-hairline bg-surface p-3.5"
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-2 font-medium text-ink-primary">
          {step.status === "running" ? (
            <IconLoader2 size={14} stroke={1.5} className="animate-spin text-accent-coral" />
          ) : (
            <IconCheck size={14} stroke={1.5} className="text-status-pass" />
          )}
          <span>
            0{step.stepIndex} · {step.label}
          </span>
        </span>
        {step.status === "done" ? (
          <span className="font-mono text-ink-muted tabular-nums">{step.durationMs}ms</span>
        ) : null}
      </div>
      {step.finding ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-secondary">{step.finding}</p>
      ) : null}
      {step.citation ? (
        <div className="mt-1.5 font-mono text-xs text-ink-muted">溯源：{step.citation}</div>
      ) : null}
    </motion.div>
  );
}

function ProposalCard({
  proposal,
  applied,
  onApply,
}: {
  proposal: AgentProposal;
  applied: boolean;
  onApply: () => Promise<void>;
}) {
  return (
    <div className="rounded-control border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink-primary">{proposal.title}</span>
        <Badge variant="titanium">{TARGET_LABELS[proposal.target]}</Badge>
      </div>
      {proposal.beforePreview ? (
        <div className="mt-2.5 rounded-control bg-muted/60 px-3 py-2 text-xs text-ink-muted">
          <span className="font-mono text-xs">原记录：</span>
          <span className="line-through opacity-80">{proposal.beforePreview}</span>
        </div>
      ) : null}
      <p className="mt-2 border-l-2 border-accent-coral/60 pl-3 text-xs leading-relaxed text-ink-primary">
        {proposal.content}
      </p>
      <p className="mt-2 text-xs text-ink-secondary">依据：{proposal.rationale}</p>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-2.5">
        <span
          title={proposal.citation}
          className="min-w-0 flex-1 truncate font-mono text-xs text-ink-muted"
        >
          {proposal.citation}
        </span>
        <Button
          variant={applied ? "ghost" : "primary"}
          size="sm"
          disabled={applied}
          onClick={() => void onApply()}
          className="shrink-0 whitespace-nowrap"
        >
          <IconCheck size={13} stroke={1.5} />
          <span>{applied ? "已采纳写入" : "人机共审 · 采纳"}</span>
        </Button>
      </div>
    </div>
  );
}

function AgentEmptyState({ onRun }: { onRun: () => Promise<void> }) {
  return (
    <div className="rounded-card border border-hairline bg-titanium-subtle p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-pill bg-surface text-ink-primary shadow-card">
        <IconSparkles size={18} stroke={1.5} />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-ink-primary">
        启动多角色投委会深度审计 Agent
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
        依次调用 SEC 法证排雷、Reverse-DCF 压力测试、假设盲区、产业链分歧、仓位纪律与季度漂移 6
        大工具，开展多角色投委会辩论并生成人机共审 Diff 提案。
      </p>
      <div className="mt-4">
        <Button variant="primary" size="md" onClick={() => void onRun()}>
          <IconPlayerPlay size={14} stroke={1.5} />
          <span>开始多步深度审计</span>
        </Button>
      </div>
    </div>
  );
}

function ProposalsSection({
  proposals,
  appliedIds,
  onApply,
}: {
  proposals: readonly AgentProposal[];
  appliedIds: readonly string[];
  onApply: (proposal: AgentProposal) => Promise<void>;
}) {
  const [batching, setBatching] = useState(false);
  const pending = proposals.filter((p) => !appliedIds.includes(p.id));
  const applyAll = async () => {
    setBatching(true);
    try {
      for (const prop of pending) {
        await onApply(prop);
      }
    } finally {
      setBatching(false);
    }
  };
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-ink-muted">
          人机共审 Diff 提案（HITL · 采纳后实时回写）
        </div>
        {pending.length >= 2 ? (
          <Button variant="titanium" size="sm" loading={batching} onClick={() => void applyAll()}>
            {!batching ? <IconChecks size={13} stroke={1.5} /> : null}
            <span>一键采纳全部 ({pending.length})</span>
          </Button>
        ) : null}
      </div>
      {proposals.map((prop) => (
        <ProposalCard
          key={prop.id}
          proposal={prop}
          applied={appliedIds.includes(prop.id)}
          onApply={() => onApply(prop)}
        />
      ))}
    </div>
  );
}

function SheetBody(props: AgentResearchSheetProps) {
  if (props.traces.length === 0 && !props.running) {
    return <AgentEmptyState onRun={props.onRun} />;
  }
  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <div className="text-xs font-semibold text-ink-muted">
          实时工具调用轨迹（6-Tool SSE Live Trace）
        </div>
        {props.traces.map((step) => (
          <TraceStepItem key={step.stepIndex} step={step} />
        ))}
      </div>
      {props.briefing ? <AgentBriefingCard briefing={props.briefing} /> : null}
      {props.briefing && props.briefing.proposals.length > 0 ? (
        <ProposalsSection
          proposals={props.briefing.proposals}
          appliedIds={props.appliedIds}
          onApply={props.onApplyProposal}
        />
      ) : null}
    </div>
  );
}

export function AgentResearchSheet(props: AgentResearchSheetProps) {
  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`投委会 Agent · ${props.companyName} (${props.ticker})`}
      subtitle="证据优先 · 6 工具轨迹 · 四角色投委会辩论 · 人机共审 Diff 写入"
      footer={
        <div className="flex items-center justify-between gap-2">
          {props.traces.length > 0 || props.running ? (
            <Button
              variant="titanium"
              size="sm"
              disabled={props.running}
              onClick={() => void props.onRun()}
            >
              <IconSparkles size={14} stroke={1.5} />
              <span>{props.running ? "多步审计运行中..." : "重新运行审计"}</span>
            </Button>
          ) : (
            <span className="text-xs text-ink-muted">审计结论将自动保存</span>
          )}
          <Button variant="outline" size="sm" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </div>
      }
    >
      <SheetBody {...props} />
    </Sheet>
  );
}
