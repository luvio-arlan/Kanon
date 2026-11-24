"use client";

import type { AgentBriefing, AgentProposal, AgentTraceStep } from "@kanon/core";
import { Badge, Button, cn, KANON_ROW_ITEM, KANON_ROW_STAGGER, Sheet } from "@kanon/ui";
import { IconCheck, IconChecks, IconPlayerPlay, IconSparkles } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { AgentBriefingCard } from "./agent-briefing-card";
import { AgentTraceLogSection } from "./agent-trace-log";

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
  variant_perception: "Step 1 · 预期差",
  key_debate: "Step 1 · 核心争论",
  pre_mortem: "Step 1 · 事前验尸",
  hypothesis_update: "Step 2 · 核心假设",
  catalyst_draft: "Step 2 · 催化剂日程",
  cross_check_draft: "Step 3 · 产业链互证",
  exit_rule: "Step 5 · 离场红线",
};

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
    <motion.div
      variants={KANON_ROW_ITEM}
      className={cn(
        "rounded-control border p-3.5 shadow-card transition-colors duration-200",
        applied ? "border-status-pass/35 bg-status-pass-soft/20" : "border-hairline bg-surface",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink-primary">{proposal.title}</span>
        <Badge variant="titanium">{TARGET_LABELS[proposal.target]}</Badge>
      </div>
      {proposal.beforePreview ? (
        <div className="mt-2 rounded-control bg-muted/60 px-3 py-1.5 text-xs text-ink-muted">
          <span className="line-through opacity-80">{proposal.beforePreview}</span>
        </div>
      ) : null}
      <p className="mt-2 border-l-2 border-accent-coral/60 pl-3 text-xs leading-relaxed text-ink-primary">
        {proposal.content}
      </p>
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
          <span>{applied ? "已采纳" : "采纳写入"}</span>
        </Button>
      </div>
    </motion.div>
  );
}

function AgentEmptyState({ onRun }: { onRun: () => Promise<void> }) {
  return (
    <div className="rounded-card border border-hairline bg-muted/55 p-3">
      <div className="rounded-control border border-hairline bg-surface p-6 text-center shadow-card">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-pill border border-hairline bg-muted/60 text-accent-coral">
          <IconSparkles size={18} stroke={1.5} />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-ink-primary">启动投委会深度审计 Agent</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
          自动执行 SEC 法证排雷、Reverse-DCF 压力测试、实时盘前/盘后买点校准、催化剂与价值陷阱审计 8
          步工具调用，输出可一键采纳的修订提案。
        </p>
        <div className="mt-4">
          <Button variant="primary" size="md" onClick={() => void onRun()}>
            <IconPlayerPlay size={14} stroke={1.5} />
            <span>开始深度审计</span>
          </Button>
        </div>
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
      for (const prop of pending) await onApply(prop);
    } finally {
      setBatching(false);
    }
  };
  return (
    <motion.div
      variants={KANON_ROW_STAGGER}
      initial="hidden"
      animate="visible"
      className="space-y-2.5 rounded-card border border-hairline bg-muted/50 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-xs font-medium text-ink-secondary">
          人机共审 Diff 提案（{proposals.length} 条）
        </span>
        {pending.length >= 2 ? (
          <Button variant="titanium" size="sm" loading={batching} onClick={() => void applyAll()}>
            {!batching ? <IconChecks size={13} stroke={1.5} /> : null}
            <span>一键采纳 ({pending.length})</span>
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
    </motion.div>
  );
}

function SheetBody(props: AgentResearchSheetProps) {
  if (props.traces.length === 0 && !props.running) {
    return <AgentEmptyState onRun={props.onRun} />;
  }
  return (
    <div className="space-y-4">
      <AgentTraceLogSection traces={props.traces} running={props.running} />
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
      subtitle="8 步工具溯源 · 实时盘前/盘后校准 · 四角色投委会辩论"
      footer={
        <div className="flex items-center justify-between gap-2">
          {props.traces.length > 0 || props.running ? (
            <Button
              variant="titanium"
              size="sm"
              loading={props.running}
              onClick={() => void props.onRun()}
            >
              {!props.running ? <IconSparkles size={14} stroke={1.5} /> : null}
              <span>{props.running ? "审计运行中" : "重新审计"}</span>
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
