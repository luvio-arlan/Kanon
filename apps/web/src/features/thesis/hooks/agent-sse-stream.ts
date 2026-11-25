"use client";

import {
  type AgentBriefing,
  type AgentPartialSynthesis,
  type AgentStreamEvent,
  AgentStreamEventSchema,
  type AgentTraceStep,
} from "@kanon/core";
import { toast } from "sonner";
import { buildByokHeaders, buildMarketHeaders } from "@/shared/lib/client-provider-storage";
import { parseValidatedSseLine } from "@/shared/lib/kanon-fetch";

export interface AgentEventSetters {
  setTraces: React.Dispatch<React.SetStateAction<AgentTraceStep[]>>;
  setPartial: React.Dispatch<React.SetStateAction<AgentPartialSynthesis | null>>;
  setBriefing: React.Dispatch<React.SetStateAction<AgentBriefing | null>>;
  setRunId: React.Dispatch<React.SetStateAction<string | null>>;
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
  const flushChunk = (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      const evt = parseValidatedSseLine(line.trim(), AgentStreamEventSchema);
      if (evt) onEvent(evt);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? "";
      for (const chunk of parts) flushChunk(chunk);
    }
    buffer += decoder.decode();
    if (buffer.trim()) flushChunk(buffer);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function dispatchAgentEvent(evt: AgentStreamEvent, setters: AgentEventSetters) {
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

export async function fetchAgentSse(
  thesisId: string,
  signal: AbortSignal,
  setters: AgentEventSetters,
): Promise<boolean> {
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
