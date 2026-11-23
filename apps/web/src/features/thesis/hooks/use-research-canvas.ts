"use client";

import type { EarningsDigest, InvestmentMemo, RedTeamReport } from "@kanon/ai";
import type {
  CreateDisciplineEntryInput,
  SecSnapshot,
  ThesisDetail,
  UpdateThesisStepInput,
} from "@kanon/core";
import { useState } from "react";
import {
  apiDeleteThesis,
  apiPatchStep,
  apiPostDiscipline,
  apiRunCopilot,
  apiSyncSec,
  type CopilotKind,
  type CopilotResult,
} from "./canvas-api";

export interface InitialCopilotState {
  redTeam: RedTeamReport | null;
  digest: EarningsDigest | null;
  investmentMemo: InvestmentMemo | null;
}

export interface CopilotStates extends InitialCopilotState {
  busy: CopilotKind | null;
}

function mergeCopilotResult(prev: CopilotStates, result: CopilotResult): CopilotStates {
  if (result.action === "red_team") return { ...prev, redTeam: result.data };
  if (result.action === "earnings_digest") return { ...prev, digest: result.data };
  return { ...prev, investmentMemo: result.data };
}

export function useResearchCanvas(
  initialThesis: ThesisDetail,
  initialSec: SecSnapshot | null,
  initialCopilot: InitialCopilotState,
) {
  const [thesis, setThesis] = useState(initialThesis);
  const [secSnapshot, setSecSnapshot] = useState(initialSec);
  const [busy, setBusy] = useState({ saving: false, deleting: false, secSyncing: false });
  const [copilot, setCopilot] = useState<CopilotStates>({ busy: null, ...initialCopilot });

  const withFlag = <T>(key: "saving" | "deleting" | "secSyncing", task: () => Promise<T>) => {
    setBusy((prev) => ({ ...prev, [key]: true }));
    return task().finally(() => setBusy((prev) => ({ ...prev, [key]: false })));
  };

  async function patchStep(payload: UpdateThesisStepInput, okMessage: string) {
    const updated = await withFlag("saving", () => apiPatchStep(thesis.id, payload, okMessage));
    if (updated) setThesis(updated);
  }
  async function submitDiscipline(entry: CreateDisciplineEntryInput) {
    const updated = await withFlag("saving", () => apiPostDiscipline(thesis.id, entry));
    if (updated) setThesis(updated);
  }
  async function syncSec() {
    const snap = await withFlag("secSyncing", () => apiSyncSec(thesis.ticker));
    if (snap) setSecSnapshot(snap);
  }
  async function runCopilot(action: CopilotKind, sourceText?: string) {
    setCopilot((prev) => ({ ...prev, busy: action }));
    const res = await apiRunCopilot(thesis.id, action, sourceText).finally(() =>
      setCopilot((prev) => ({ ...prev, busy: null })),
    );
    if (res) setCopilot((prev) => mergeCopilotResult(prev, res));
  }
  const deleteCurrentThesis = () => withFlag("deleting", () => apiDeleteThesis(thesis.id));

  return {
    thesis,
    secSnapshot,
    ...busy,
    copilot,
    patchStep,
    submitDiscipline,
    syncSec,
    runCopilot,
    deleteCurrentThesis,
  };
}
