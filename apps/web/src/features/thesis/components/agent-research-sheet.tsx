"use client";

import type { AgentBriefing, AgentProposal, AgentTraceStep } from "@kanon/core";
import { Badge, Button, ReadinessRing, Sheet } from "@kanon/ui";
import { IconCheck, IconLoader2, IconPlayerPlay, IconSparkles } from "@tabler/icons-react";

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
    <div className="rounded-control border border-hairline bg-surface p-3.5">
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
    </div>
  );
}

function IcBriefingSummary({ briefing }: { briefing: AgentBriefing }) {
  return (
    <div className="space-y-3 rounded-card border border-hairline bg-titanium-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
            <span>多角色投委会综合判定</span>
            <Badge variant={briefing.engine === "vercel-ai-sdk" ? "pass" : "default"}>
              {briefing.engine === "vercel-ai-sdk" ? "BYOK 模型综合" : "确定性引擎"}
            </Badge>
          </div>
          <div className="mt-1 text-sm font-semibold text-ink-primary">{briefing.verdict}</div>
        </div>
        <ReadinessRing
          scorePct={briefing.convictionScore}
          size={34}
          label={`${briefing.convictionScore}`}
        />
      </div>
      {briefing.fallbackReason ? (
        <div className="rounded-control bg-status-warn-soft px-3 py-1.5 text-xs text-status-warn">
          {briefing.fallbackReason}
        </div>
      ) : null}
      <div className="space-y-2 border-t border-hairline pt-3 text-xs leading-relaxed">
        <div>
          <span className="font-semibold text-ink-primary">多头预期差：</span>
          <span className="text-ink-secondary">{briefing.bullSynthesis}</span>
        </div>
        <div>
          <span className="font-semibold text-ink-primary">法证空头反演：</span>
          <span className="text-ink-secondary">{briefing.bearCritique}</span>
        </div>
        <div>
          <span className="font-semibold text-ink-primary">财务质量体检：</span>
          <span className="text-ink-secondary">{briefing.accountingCheck}</span>
        </div>
      </div>
    </div>
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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2.5">
        <span className="font-mono text-xs text-ink-muted">{proposal.citation}</span>
        <Button
          variant={applied ? "ghost" : "primary"}
          size="sm"
          disabled={applied}
          onClick={() => void onApply()}
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
        依次调用 SEC 14 项法证排雷、Reverse-DCF 压力测试、假设盲区、产业链分歧与仓位纪律 5
        大工具，持久化留痕并生成可对比 Diff 的人机共审提案。
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

function SheetBody(props: AgentResearchSheetProps) {
  if (props.traces.length === 0 && !props.running) {
    return <AgentEmptyState onRun={props.onRun} />;
  }
  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <div className="text-xs font-semibold text-ink-muted">
          实时工具调用轨迹（SSE Live Trace）
        </div>
        {props.traces.map((step) => (
          <TraceStepItem key={step.stepIndex} step={step} />
        ))}
      </div>
      {props.briefing ? <IcBriefingSummary briefing={props.briefing} /> : null}
      {props.briefing && props.briefing.proposals.length > 0 ? (
        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-ink-muted">
            人机共审 Diff 提案（HITL · 采纳后实时回写并持久记录）
          </div>
          {props.briefing.proposals.map((prop) => (
            <ProposalCard
              key={prop.id}
              proposal={prop}
              applied={props.appliedIds.includes(prop.id)}
              onApply={() => props.onApplyProposal(prop)}
            />
          ))}
        </div>
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
      subtitle="证据优先 · 5 工具轨迹 · 多角色辩论 · 人机共审 Diff 写入"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="titanium"
            size="sm"
            disabled={props.running}
            onClick={() => void props.onRun()}
          >
            <IconSparkles size={14} stroke={1.5} />
            <span>{props.running ? "多步审计运行中..." : "重新运行审计"}</span>
          </Button>
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
