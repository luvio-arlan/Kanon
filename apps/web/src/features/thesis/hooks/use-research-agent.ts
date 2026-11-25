"use client";

import type {
  AgentAskResponse,
  AgentBriefing,
  AgentPartialSynthesis,
  AgentTraceStep,
  SavedAgentRun,
} from "@kanon/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type AgentEventSetters, fetchAgentSse } from "./agent-sse-stream";
import { apiApplyAgentProposals, apiAskResearchIc, apiListAgentRuns } from "./canvas-api";
import type { useResearchCanvas } from "./use-research-canvas";

function useAgentRunner(params: {
  thesisId: string;
  setters: AgentEventSetters;
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
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setRunning(false);
      }
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

function useAskIcState(thesisId: string) {
  const [asking, setAsking] = useState(false);
  const [askAnswer, setAskAnswer] = useState<AgentAskResponse | null>(null);
  const askIc = useCallback(
    async (question: string) => {
      setAsking(true);
      const res = await apiAskResearchIc(thesisId, question).finally(() => setAsking(false));
      if (res) setAskAnswer(res);
    },
    [thesisId],
  );
  return { asking, askAnswer, askIc };
}

function useAgentHistory(params: {
  thesisId: string;
  initialRun: SavedAgentRun | null;
  setters: AgentEventSetters;
  setAppliedIds: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const { thesisId, initialRun, setters, setAppliedIds } = params;
  const [runsHistory, setRunsHistory] = useState<SavedAgentRun[]>(initialRun ? [initialRun] : []);
  const loadHistory = useCallback(async () => {
    const runs = await apiListAgentRuns(thesisId);
    if (runs.length > 0) setRunsHistory(runs);
  }, [thesisId]);
  const selectRun = useCallback(
    (targetRunId: string) => {
      const match = runsHistory.find((r) => r.id === targetRunId);
      if (!match) return;
      setters.setRunId(match.id);
      setters.setTraces(match.briefing.traces);
      setters.setBriefing(match.briefing);
      setAppliedIds(match.appliedProposalIds);
      setters.setPartial(null);
    },
    [runsHistory, setAppliedIds, setters],
  );
  return { runsHistory, setRunsHistory, loadHistory, selectRun };
}

export function useResearchAgent(thesisId: string, initialRun: SavedAgentRun | null) {
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(initialRun?.id ?? null);
  const [traces, setTraces] = useState<AgentTraceStep[]>(initialRun?.briefing.traces ?? []);
  const [partial, setPartial] = useState<AgentPartialSynthesis | null>(null);
  const [briefing, setBriefing] = useState<AgentBriefing | null>(initialRun?.briefing ?? null);
  const [appliedIds, setAppliedIds] = useState<string[]>(initialRun?.appliedProposalIds ?? []);
  const setters = useMemo<AgentEventSetters>(
    () => ({ setTraces, setPartial, setBriefing, setRunId }),
    [],
  );
  const { runsHistory, setRunsHistory, loadHistory, selectRun } = useAgentHistory({
    thesisId,
    initialRun,
    setters,
    setAppliedIds,
  });
  const { runAgent, stopAgent } = useAgentRunner({
    thesisId,
    setters,
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
    ...useAskIcState(thesisId),
    runAgent,
    stopAgent,
    loadHistory,
    selectRun,
    applyProposals: useAgentProposalApplier(runId, setAppliedIds, setRunsHistory),
  };
}
