"use client";

import type {
  AgentAskResponse,
  AgentBriefing,
  AgentPartialSynthesis,
  AgentProposal,
  AgentTraceStep,
  SavedAgentRun,
} from "@kanon/core";
import { Badge, Button, cn, KANON_ROW_ITEM, KANON_ROW_STAGGER, KanonMark, Sheet } from "@kanon/ui";
import {
  IconCheck,
  IconChecks,
  IconPlayerPlay,
  IconPlayerStop,
  IconSparkles,
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { AgentAskPanel } from "./agent/agent-ask-panel";
import { AgentHistoryBar } from "./agent/agent-history-bar";
import { AgentBriefingCard, AgentStreamingCard } from "./agent-briefing-card";
import { AgentTraceLogSection } from "./agent-trace-log";

export interface AgentResearchSheetProps {
  open: boolean;
  ticker: string;
  companyName: string;
  running: boolean;
  asking: boolean;
  askAnswer: AgentAskResponse | null;
  activeRunId: string | null;
  runsHistory: readonly SavedAgentRun[];
  traces: readonly AgentTraceStep[];
  partial?: AgentPartialSynthesis | null;
  briefing: AgentBriefing | null;
  appliedIds: readonly string[];
  onOpenChange: (open: boolean) => void;
  onRun: () => Promise<void>;
  onStop: () => void;
  onAskIc: (question: string) => Promise<void>;
  onSelectRun: (runId: string) => void;
  onApplyProposals: (proposalIds: readonly string[]) => Promise<void>;
}

const TARGET_LABELS: Record<AgentProposal["target"], string> = {
  variant_perception: "预期差",
  key_debate: "核心分歧",
  pre_mortem: "逆向推演",
  hypothesis_update: "核心假设",
  catalyst_draft: "催化剂",
  cross_check_draft: "产业链互证",
  exit_rule: "离场条件",
};

function ProposalRow({
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
        "px-5 py-4 transition-colors duration-200 sm:px-6",
        applied && "bg-status-pass-soft/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-primary">{proposal.title}</span>
            <Badge variant="titanium">{TARGET_LABELS[proposal.target]}</Badge>
          </div>
          {proposal.beforePreview ? (
            <p className="text-xs text-ink-muted line-through opacity-75">
              {proposal.beforePreview}
            </p>
          ) : null}
        </div>
        <Button
          variant={applied ? "ghost" : "outline"}
          size="xs"
          disabled={applied}
          onClick={() => void onApply()}
          className="shrink-0 whitespace-nowrap"
        >
          <IconCheck size={13} stroke={1.5} />
          <span>{applied ? "已采纳" : "采纳"}</span>
        </Button>
      </div>
      <p className="mt-2.5 border-l-2 border-accent-coral/55 pl-3 text-sm leading-[1.7] text-ink-secondary">
        {proposal.content}
      </p>
    </motion.div>
  );
}

function AgentEmptyState({ onRun }: { onRun: () => Promise<void> }) {
  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center rounded-panel border border-hairline bg-surface px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-pill border border-hairline bg-canvas">
        <KanonMark size={20} accent />
      </div>
      <h3 className="mt-5 text-base font-semibold tracking-[-0.015em] text-ink-primary">
        投委会深度审计
      </h3>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-secondary">
        交叉核验财务法证、隐含预期与多空分歧，生成可一键写入的修订提案。
      </p>
      <div className="mt-6">
        <Button variant="primary" size="md" onClick={() => void onRun()}>
          <IconPlayerPlay size={14} stroke={1.5} />
          <span>开始审计</span>
        </Button>
      </div>
    </div>
  );
}

function ProposalsSection({
  proposals,
  appliedIds,
  onApplyProposals,
}: {
  proposals: readonly AgentProposal[];
  appliedIds: readonly string[];
  onApplyProposals: (proposalIds: readonly string[]) => Promise<void>;
}) {
  const [batching, setBatching] = useState(false);
  const pending = proposals.filter((p) => !appliedIds.includes(p.id));
  const applyAll = async () => {
    setBatching(true);
    try {
      await onApplyProposals(pending.map((p) => p.id));
    } finally {
      setBatching(false);
    }
  };
  return (
    <motion.section
      variants={KANON_ROW_STAGGER}
      initial="hidden"
      animate="visible"
      className="overflow-hidden rounded-panel border border-hairline bg-surface"
    >
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3.5 sm:px-6">
        <span className="text-xs font-medium text-ink-muted">修订提案 · {proposals.length}</span>
        {pending.length >= 2 ? (
          <Button variant="ghost" size="xs" loading={batching} onClick={() => void applyAll()}>
            {!batching ? <IconChecks size={13} stroke={1.5} /> : null}
            <span>全部采纳 ({pending.length})</span>
          </Button>
        ) : null}
      </div>
      <div className="divide-y divide-hairline">
        {proposals.map((prop) => (
          <ProposalRow
            key={prop.id}
            proposal={prop}
            applied={appliedIds.includes(prop.id)}
            onApply={() => onApplyProposals([prop.id])}
          />
        ))}
      </div>
    </motion.section>
  );
}

function SheetBody(props: AgentResearchSheetProps) {
  if (props.traces.length === 0 && !props.running && !props.briefing) {
    return <AgentEmptyState onRun={props.onRun} />;
  }
  if (props.running && !props.briefing) {
    return (
      <div className="space-y-4">
        <AgentTraceLogSection traces={props.traces} running />
        {props.partial ? <AgentStreamingCard partial={props.partial} /> : null}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <AgentHistoryBar
        runs={props.runsHistory}
        activeRunId={props.activeRunId}
        onSelect={props.onSelectRun}
      />
      {props.briefing ? <AgentBriefingCard briefing={props.briefing} /> : null}
      {props.briefing && props.briefing.proposals.length > 0 ? (
        <ProposalsSection
          proposals={props.briefing.proposals}
          appliedIds={props.appliedIds}
          onApplyProposals={props.onApplyProposals}
        />
      ) : null}
      {props.briefing ? (
        <AgentAskPanel asking={props.asking} answer={props.askAnswer} onAsk={props.onAskIc} />
      ) : null}
      {props.traces.length > 0 ? (
        <AgentTraceLogSection traces={props.traces} running={false} collapsedByDefault />
      ) : null}
    </div>
  );
}

export function AgentResearchSheet(props: AgentResearchSheetProps) {
  const hasRun = props.traces.length > 0 || Boolean(props.briefing) || props.running;
  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`投委会审计 · ${props.companyName}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          {props.running ? (
            <Button variant="outline" size="sm" onClick={props.onStop}>
              <IconPlayerStop size={14} stroke={1.5} />
              <span>停止审计</span>
            </Button>
          ) : hasRun ? (
            <Button variant="titanium" size="sm" onClick={() => void props.onRun()}>
              <IconSparkles size={14} stroke={1.5} />
              <span>重新审计</span>
            </Button>
          ) : (
            <span aria-hidden="true" />
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
