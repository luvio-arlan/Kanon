"use client";

import type { EarningsDigest, RedTeamReport, VideoScript } from "@kanon/ai";
import type {
  CreateDisciplineEntryInput,
  SecSnapshot,
  ThesisDetail,
  UpdateThesisStepInput,
} from "@kanon/core";
import { useState } from "react";
import {
  apiPatchStep,
  apiPostDiscipline,
  apiRunCopilot,
  apiSyncSec,
  type CopilotKind,
} from "./canvas-api";

export interface CopilotStates {
  busy: CopilotKind | null;
  redTeam: RedTeamReport | null;
  digest: EarningsDigest | null;
  videoScript: VideoScript | null;
}

const EMPTY_COPILOT: CopilotStates = {
  busy: null,
  redTeam: null,
  digest: null,
  videoScript: null,
};

function mergeCopilotData(prev: CopilotStates, action: CopilotKind, data: unknown): CopilotStates {
  return {
    ...prev,
    redTeam: action === "red_team" ? (data as RedTeamReport) : prev.redTeam,
    digest: action === "earnings_digest" ? (data as EarningsDigest) : prev.digest,
    videoScript: action === "video_script" ? (data as VideoScript) : prev.videoScript,
  };
}

export function useResearchCanvas(initialThesis: ThesisDetail, initialSec: SecSnapshot | null) {
  const [thesis, setThesis] = useState<ThesisDetail>(initialThesis);
  const [secSnapshot, setSecSnapshot] = useState<SecSnapshot | null>(initialSec);
  const [saving, setSaving] = useState(false);
  const [secSyncing, setSecSyncing] = useState(false);
  const [copilot, setCopilot] = useState<CopilotStates>(EMPTY_COPILOT);

  async function patchStep(payload: UpdateThesisStepInput, okMessage: string) {
    setSaving(true);
    const updated = await apiPatchStep(thesis.id, payload, okMessage).finally(() =>
      setSaving(false),
    );
    if (updated) setThesis(updated);
  }

  async function submitDiscipline(entry: CreateDisciplineEntryInput) {
    setSaving(true);
    const updated = await apiPostDiscipline(thesis.id, entry).finally(() => setSaving(false));
    if (updated) setThesis(updated);
  }

  async function syncSec() {
    setSecSyncing(true);
    const snap = await apiSyncSec(thesis.ticker).finally(() => setSecSyncing(false));
    if (snap) setSecSnapshot(snap);
  }

  async function runCopilot(action: CopilotKind) {
    setCopilot((prev) => ({ ...prev, busy: action }));
    const data = await apiRunCopilot(thesis.id, action).finally(() =>
      setCopilot((prev) => ({ ...prev, busy: null })),
    );
    if (data) setCopilot((prev) => mergeCopilotData(prev, action, data));
  }

  return {
    thesis,
    secSnapshot,
    saving,
    secSyncing,
    copilot,
    patchStep,
    submitDiscipline,
    syncSec,
    runCopilot,
  };
}
