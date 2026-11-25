"use client";

import {
  type AgentBriefing,
  type AgentPartialSynthesis,
  type AgentProposal,
  type AgentStreamEvent,
  AgentStreamEventSchema,
  type AgentTraceStep,
  type CrossCheck,
  type SavedAgentRun,
  type ThesisCatalyst,
} from "@kanon/core";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { buildByokHeaders, buildMarketHeaders } from "@/features/ai-settings";
import { parseValidatedSseLine } from "@/shared/lib/kanon-fetch";
import { apiMarkAgentApplied } from "./canvas-api";
import type { useResearchCanvas } from "./use-research-canvas";

function upsertTrace(list: AgentTraceStep[], next: AgentTraceStep): AgentTraceStep[] {
  const idx = list.findIndex((item) => item.stepIndex === next.stepIndex);
  if (idx === -1) return [...list, next];
  const copy = [...list];
  copy[idx] = next;
  return copy;
}

async function readEventStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: AgentStreamEvent) => void,
) {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const chunk of parts) {
      const evt = parseValidatedSseLine(chunk.trim(), AgentStreamEventSchema);
      if (evt) onEvent(evt);
    }
  }
}

interface EventSetters {
  setTraces: React.Dispatch<React.SetStateAction<AgentTraceStep[]>>;
  setPartial: React.Dispatch<React.SetStateAction<AgentPartialSynthesis | null>>;
  setBriefing: React.Dispatch<React.SetStateAction<AgentBriefing | null>>;
  setRunId: React.Dispatch<React.SetStateAction<string | null>>;
}

function dispatchAgentEvent(evt: AgentStreamEvent, setters: EventSetters) {
  if (evt.type === "trace_start") {
    setters.setTraces((prev) =>
      upsertTrace(prev, {
        stepIndex: evt.stepIndex,
        toolName: evt.toolName,
        label: evt.label,
        status: "running",
        durationMs: 0,
        finding: "",
        citation: "",
      }),
    );
    return;
  }
  if (evt.type === "trace_done") {
    setters.setTraces((prev) => upsertTrace(prev, evt.trace));
    return;
  }
  if (evt.type === "synthesis_partial") {
    setters.setPartial(evt.partial);
    return;
  }
  if (evt.type === "briefing_ready") {
    setters.setPartial(null);
    setters.setBriefing(evt.briefing);
    if (evt.runId) setters.setRunId(evt.runId);
    return;
  }
  if (evt.type === "error") toast.error(evt.message);
}

export function useResearchAgent(thesisId: string, initialRun: SavedAgentRun | null) {
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(initialRun?.id ?? null);
  const [traces, setTraces] = useState<AgentTraceStep[]>(initialRun?.briefing.traces ?? []);
  const [partial, setPartial] = useState<AgentPartialSynthesis | null>(null);
  const [briefing, setBriefing] = useState<AgentBriefing | null>(initialRun?.briefing ?? null);
  const [appliedIds, setAppliedIds] = useState<string[]>(initialRun?.appliedProposalIds ?? []);

  const runAgent = useCallback(async () => {
    setRunning(true);
    setTraces([]);
    setPartial(null);
    setBriefing(null);
    setAppliedIds([]);
    try {
      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildByokHeaders(),
          ...buildMarketHeaders(),
        },
        body: JSON.stringify({ thesisId }),
      });
      if (!res.ok || !res.body) {
        toast.error("投研 Agent 启动失败，请重试");
        return;
      }
      await readEventStream(res.body.getReader(), (evt) =>
        dispatchAgentEvent(evt, { setTraces, setPartial, setBriefing, setRunId }),
      );
    } finally {
      setRunning(false);
    }
  }, [thesisId]);

  const markApplied = useCallback(
    async (proposalId: string) => {
      setAppliedIds((prev) => (prev.includes(proposalId) ? prev : [...prev, proposalId]));
      if (runId) {
        await apiMarkAgentApplied(runId, proposalId);
      }
    },
    [runId],
  );

  return { running, traces, partial, briefing, appliedIds, runAgent, markApplied };
}

function buildCatalystFromProposal(proposal: AgentProposal): ThesisCatalyst {
  return {
    id: `cat-agent-${Date.now().toString(36).slice(-5)}`,
    title: proposal.title.slice(0, 120),
    dateLabel: proposal.meta?.catalystDateLabel ?? "下一季财报",
    category: proposal.meta?.catalystCategory ?? "earnings",
    impact: "high",
    direction: "bullish",
    status: "upcoming",
    verificationMetric: proposal.meta?.catalystMetric ?? "核心业绩与毛利率指引",
    note: proposal.content.slice(0, 380),
  };
}

function buildCrossCheckFromProposal(proposal: AgentProposal): CrossCheck {
  return {
    id: `cc-agent-${Date.now().toString(36).slice(-5)}`,
    peerCompany: proposal.meta?.peerCompany ?? "产业链上下游伙伴",
    peerRole: proposal.meta?.peerRole ?? "upstream",
    topic: proposal.meta?.topic ?? proposal.title,
    sourceAnchor: proposal.citation,
    statement: proposal.content,
    alignment: "pending",
    takeaway: proposal.rationale,
  };
}

async function applyBusinessFilterProposal(
  proposal: AgentProposal,
  ctrl: ReturnType<typeof useResearchCanvas>,
) {
  const fieldKey =
    proposal.target === "variant_perception"
      ? "variantPerception"
      : proposal.target === "key_debate"
        ? "keyDebate"
        : "preMortem";
  await ctrl.patchStep(
    {
      step: "business_filter",
      status: ctrl.thesis.status,
      convictionSummary: ctrl.thesis.convictionSummary,
      businessFilter: { ...ctrl.thesis.businessFilter, [fieldKey]: proposal.content },
    },
    `已人机共审采纳并写入：${proposal.title}`,
  );
}

async function dispatchAgentProposal(
  proposal: AgentProposal,
  ctrl: ReturnType<typeof useResearchCanvas>,
  onPromoteExitRule: (rule: string) => void,
) {
  if (proposal.target === "exit_rule") {
    onPromoteExitRule(proposal.content);
    return;
  }
  if (proposal.target === "hypothesis_update") {
    const idx = proposal.meta?.hypothesisIndex ?? 0;
    const nextHyps = ctrl.thesis.hypotheses.map((h, i) =>
      i === idx
        ? { ...h, status: proposal.meta?.hypothesisStatus ?? h.status, note: proposal.content }
        : h,
    );
    await ctrl.patchStep(
      { step: "hypotheses", hypotheses: nextHyps },
      `已采纳并更新假设：${proposal.title}`,
    );
    return;
  }
  if (proposal.target === "catalyst_draft") {
    const nextCatalysts = [...ctrl.thesis.catalysts, buildCatalystFromProposal(proposal)];
    await ctrl.patchStep({ step: "catalysts", catalysts: nextCatalysts }, "已增补催化剂日程节点");
    return;
  }
  if (proposal.target === "cross_check_draft") {
    const nextChecks = [...ctrl.thesis.crossChecks, buildCrossCheckFromProposal(proposal)];
    await ctrl.patchStep(
      { step: "cross_checks", crossChecks: nextChecks },
      "已增补产业链交叉验证条目",
    );
    return;
  }
  await applyBusinessFilterProposal(proposal, ctrl);
}

export async function applyAgentProposal(params: {
  proposal: AgentProposal;
  ctrl: ReturnType<typeof useResearchCanvas>;
  onPromoteExitRule: (rule: string) => void;
  onApplied: (id: string) => Promise<void>;
}) {
  await dispatchAgentProposal(params.proposal, params.ctrl, params.onPromoteExitRule);
  await params.onApplied(params.proposal.id);
}
