"use client";

import type { AgentBriefing, AgentProposal, AgentStreamEvent, AgentTraceStep } from "@kanon/ai";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { useResearchCanvas } from "./use-research-canvas";

function parseSseLine(line: string): AgentStreamEvent | null {
  if (!line.startsWith("data: ")) return null;
  try {
    return JSON.parse(line.slice(6)) as AgentStreamEvent;
  } catch {
    return null;
  }
}

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
      const evt = parseSseLine(chunk.trim());
      if (evt) onEvent(evt);
    }
  }
}

interface EventSetters {
  setTraces: React.Dispatch<React.SetStateAction<AgentTraceStep[]>>;
  setBriefing: React.Dispatch<React.SetStateAction<AgentBriefing | null>>;
}

function dispatchAgentEvent(evt: AgentStreamEvent, setters: EventSetters) {
  if (evt.type === "trace_start") {
    const runningStep: AgentTraceStep = {
      stepIndex: evt.stepIndex,
      toolName: evt.toolName,
      label: evt.label,
      status: "running",
      durationMs: 0,
      finding: "",
      citation: "",
    };
    setters.setTraces((prev) => upsertTrace(prev, runningStep));
    return;
  }
  if (evt.type === "trace_done") {
    setters.setTraces((prev) => upsertTrace(prev, evt.trace));
    return;
  }
  if (evt.type === "briefing_ready") {
    setters.setBriefing(evt.briefing);
    return;
  }
  if (evt.type === "error") toast.error(evt.message);
}

export function useResearchAgent(thesisId: string) {
  const [running, setRunning] = useState(false);
  const [traces, setTraces] = useState<AgentTraceStep[]>([]);
  const [briefing, setBriefing] = useState<AgentBriefing | null>(null);
  const [appliedIds, setAppliedIds] = useState<string[]>([]);

  const runAgent = useCallback(async () => {
    setRunning(true);
    setTraces([]);
    setBriefing(null);
    try {
      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesisId }),
      });
      if (!res.ok || !res.body) {
        toast.error("投研 Agent 启动失败，请重试");
        return;
      }
      await readEventStream(res.body.getReader(), (evt) =>
        dispatchAgentEvent(evt, { setTraces, setBriefing }),
      );
    } finally {
      setRunning(false);
    }
  }, [thesisId]);

  const markApplied = useCallback(
    (proposalId: string) =>
      setAppliedIds((prev) => (prev.includes(proposalId) ? prev : [...prev, proposalId])),
    [],
  );

  return { running, traces, briefing, appliedIds, runAgent, markApplied };
}

export async function applyAgentProposal(params: {
  proposal: AgentProposal;
  ctrl: ReturnType<typeof useResearchCanvas>;
  onPromoteExitRule: (rule: string) => void;
  onApplied: (id: string) => void;
}) {
  const { proposal, ctrl, onPromoteExitRule, onApplied } = params;
  if (proposal.target === "exit_rule") {
    onPromoteExitRule(proposal.content);
    onApplied(proposal.id);
    return;
  }
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
  onApplied(proposal.id);
}
