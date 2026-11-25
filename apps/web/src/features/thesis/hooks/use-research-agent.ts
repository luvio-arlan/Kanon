"use client";

import {
  type AgentBriefing,
  type AgentPartialSynthesis,
  type AgentStreamEvent,
  AgentStreamEventSchema,
  type AgentTraceStep,
  type SavedAgentRun,
} from "@kanon/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { buildByokHeaders, buildMarketHeaders } from "@/features/ai-settings";
import { parseValidatedSseLine } from "@/shared/lib/kanon-fetch";
import { apiApplyAgentProposals, apiListAgentRuns } from "./canvas-api";
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

async function fetchAgentSse(thesisId: string, signal: AbortSignal, setters: EventSetters) {
  const res = await fetch("/api/ai/agent", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...buildByokHeaders(), ...buildMarketHeaders() },
    body: JSON.stringify({ thesisId }),
  });
  if (!res.ok || !res.body) {
    toast.error("投研 Agent 启动失败，请重试");
    return false;
  }
  await readEventStream(res.body.getReader(), (evt) => dispatchAgentEvent(evt, setters));
  return true;
}

function useAgentRunner(params: {
  thesisId: string;
  setters: EventSetters;
  setRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setAppliedIds: React.Dispatch<React.SetStateAction<string[]>>;
  loadHistory: () => Promise<void>;
}) {
  const { thesisId, setters, setRunning, setAppliedIds, loadHistory } = params;
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const stopAgent = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, [setRunning]);

  const runAgent = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setters.setTraces([]);
    setters.setPartial(null);
    setters.setBriefing(null);
    setAppliedIds([]);
    try {
      const ok = await fetchAgentSse(thesisId, ctrl.signal, setters);
      if (ok) void loadHistory();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error("投研 Agent 连接中断，请重试");
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setRunning(false);
    }
  }, [loadHistory, setAppliedIds, setRunning, setters, thesisId]);

  return { runAgent, stopAgent };
}

function useAgentProposalApplier(
  runId: string | null,
  setAppliedIds: React.Dispatch<React.SetStateAction<string[]>>,
  setRunsHistory: React.Dispatch<React.SetStateAction<SavedAgentRun[]>>,
) {
  return useCallback(
    async (params: {
      proposalIds: readonly string[];
      ctrl: ReturnType<typeof useResearchCanvas>;
      onPromoteExitRule: (rule: string) => void;
    }) => {
      if (!runId || params.proposalIds.length === 0) return;
      const res = await apiApplyAgentProposals(runId, params.proposalIds);
      if (!res) return;
      setAppliedIds(res.appliedProposalIds);
      setRunsHistory((prev) =>
        prev.map((r) =>
          r.id === runId ? { ...r, appliedProposalIds: res.appliedProposalIds } : r,
        ),
      );
      if (res.thesis) {
        params.ctrl.applyMutation({ thesis: res.thesis, revisions: res.revisions });
        toast.success(`已人机共审采纳 ${params.proposalIds.length} 项修订提案`);
      }
      if (res.promotedExitRules?.[0]) params.onPromoteExitRule(res.promotedExitRules[0]);
    },
    [runId, setAppliedIds, setRunsHistory],
  );
}

export function useResearchAgent(thesisId: string, initialRun: SavedAgentRun | null) {
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(initialRun?.id ?? null);
  const [traces, setTraces] = useState<AgentTraceStep[]>(initialRun?.briefing.traces ?? []);
  const [partial, setPartial] = useState<AgentPartialSynthesis | null>(null);
  const [briefing, setBriefing] = useState<AgentBriefing | null>(initialRun?.briefing ?? null);
  const [appliedIds, setAppliedIds] = useState<string[]>(initialRun?.appliedProposalIds ?? []);
  const [runsHistory, setRunsHistory] = useState<SavedAgentRun[]>(initialRun ? [initialRun] : []);

  const loadHistory = useCallback(async () => {
    const runs = await apiListAgentRuns(thesisId);
    if (runs.length > 0) setRunsHistory(runs);
  }, [thesisId]);

  const selectRun = useCallback(
    (targetRunId: string) => {
      const match = runsHistory.find((r) => r.id === targetRunId);
      if (!match) return;
      setRunId(match.id);
      setTraces(match.briefing.traces);
      setBriefing(match.briefing);
      setAppliedIds(match.appliedProposalIds);
      setPartial(null);
    },
    [runsHistory],
  );

  const { runAgent, stopAgent } = useAgentRunner({
    thesisId,
    setters: { setTraces, setPartial, setBriefing, setRunId },
    setRunning,
    setAppliedIds,
    loadHistory,
  });
  return {
    running,
    runId,
    traces,
    partial,
    briefing,
    appliedIds,
    runsHistory,
    runAgent,
    stopAgent,
    loadHistory,
    selectRun,
    applyProposals: useAgentProposalApplier(runId, setAppliedIds, setRunsHistory),
  };
}
