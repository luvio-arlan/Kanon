"use client";

import type {
  CreateDisciplineEntryInput,
  CreateQuarterlyReviewInput,
  EarningsDigest,
  InvestmentMemo,
  QuarterlyReview,
  RedTeamReport,
  SecSnapshot,
  ThesisDetail,
  ThesisRevision,
  UpdateThesisStepInput,
} from "@kanon/core";
import { useState } from "react";
import {
  apiCreateQuarterlyReview,
  apiDeleteThesis,
  apiPatchStep,
  apiPostDiscipline,
  apiRunCopilot,
  apiSyncSec,
  type CopilotKind,
  type CopilotResult,
  type ThesisMutationResult,
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

function useBusyState() {
  const [busy, setBusy] = useState({ saving: false, deleting: false, secSyncing: false });
  const withFlag = <T>(key: "saving" | "deleting" | "secSyncing", task: () => Promise<T>) => {
    setBusy((prev) => ({ ...prev, [key]: true }));
    return task().finally(() => setBusy((prev) => ({ ...prev, [key]: false })));
  };
  return { busy, withFlag };
}

function useCopilotRunner(thesisId: string, initialCopilot: InitialCopilotState) {
  const [copilot, setCopilot] = useState<CopilotStates>({ busy: null, ...initialCopilot });
  const runCopilot = async (action: CopilotKind, sourceText?: string) => {
    setCopilot((prev) => ({ ...prev, busy: action }));
    const res = await apiRunCopilot(thesisId, action, sourceText).finally(() =>
      setCopilot((prev) => ({ ...prev, busy: null })),
    );
    if (res) setCopilot((prev) => mergeCopilotResult(prev, res));
  };
  return { copilot, runCopilot };
}

export function useResearchCanvas(
  initialThesis: ThesisDetail,
  initialSec: SecSnapshot | null,
  initialCopilot: InitialCopilotState,
  initialRevisions: readonly ThesisRevision[],
  initialReviews: readonly QuarterlyReview[],
) {
  const [thesis, setThesis] = useState(initialThesis);
  const [revisions, setRevisions] = useState<ThesisRevision[]>([...initialRevisions]);
  const [reviews, setReviews] = useState<QuarterlyReview[]>([...initialReviews]);
  const [secSnapshot, setSecSnapshot] = useState(initialSec);
  const { busy, withFlag } = useBusyState();
  const { copilot, runCopilot } = useCopilotRunner(thesis.id, initialCopilot);

  const applyMutation = (res: ThesisMutationResult | null) => {
    if (!res) return;
    setThesis(res.thesis);
    if (res.revisions) setRevisions(res.revisions);
  };
  const patchStep = async (payload: UpdateThesisStepInput, okMessage: string) =>
    applyMutation(await withFlag("saving", () => apiPatchStep(thesis.id, payload, okMessage)));
  const submitDiscipline = async (entry: CreateDisciplineEntryInput) =>
    applyMutation(await withFlag("saving", () => apiPostDiscipline(thesis.id, entry)));
  const submitQuarterlyReview = async (input: CreateQuarterlyReviewInput) => {
    const res = await withFlag("saving", () => apiCreateQuarterlyReview(thesis.id, input));
    if (!res) return;
    setThesis(res.thesis);
    setRevisions(res.revisions);
    setReviews((prev) => [res.review, ...prev]);
  };
  const syncSec = async () => {
    const snap = await withFlag("secSyncing", () => apiSyncSec(thesis.ticker));
    if (snap) setSecSnapshot(snap);
  };
  return {
    thesis,
    revisions,
    reviews,
    secSnapshot,
    ...busy,
    copilot,
    patchStep,
    submitDiscipline,
    submitQuarterlyReview,
    syncSec,
    runCopilot,
    deleteCurrentThesis: () => withFlag("deleting", () => apiDeleteThesis(thesis.id)),
  };
}
