"use client";

import type {
  AgentAskResponse,
  AgentBriefing,
  AgentPartialSynthesis,
  AgentTraceStep,
  SavedAgentRun,
} from "@kanon/core";
import { Button, KanonMark, Sheet } from "@kanon/ui";
import { IconPlayerPlay, IconPlayerStop, IconSparkles } from "@tabler/icons-react";
import { AgentAskPanel } from "./agent/agent-ask-panel";
import { AgentHistoryBar } from "./agent/agent-history-bar";
import { AgentProposalsSection } from "./agent/agent-proposals-section";
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
        <AgentProposalsSection
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
