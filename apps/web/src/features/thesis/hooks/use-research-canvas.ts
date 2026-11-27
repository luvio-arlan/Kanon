"use client";

import type {
  CreateDisciplineEntryInput,
  CreateQuarterlyReviewInput,
  EarningsDigest,
  InvestmentMemo,
  QuarterlyReview,
  RedTeamReport,
  ResearchNote,
  SecSnapshot,
  ThesisDetail,
  ThesisRevision,
  UpdateThesisStepInput,
} from "@kanon/core";
import { useCallback, useRef, useState } from "react";
import {
  apiCreateQuarterlyReview,
  apiDeleteThesis,
  apiPostDiscipline,
  apiRunCopilot,
  apiSyncSec,
  type CopilotKind,
  type CopilotResult,
  type ThesisMutationResult,
} from "./canvas-api";
import { createSerializedPatchStep } from "./canvas-patch-step";
import { broadcastThesisSync, useThesisBroadcastSync } from "./use-thesis-broadcast";

export interface RestatementRef {
  concept: string;
  periodEnd: string;
  originalValue: number;
  restatedValue: number;
  restatedAccession: string;
}

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

function useSecondaryMutations(
  thesis: ThesisDetail,
  canWrite: boolean,
  applyMutation: (res: ThesisMutationResult | null) => void,
  setReviews: React.Dispatch<React.SetStateAction<QuarterlyReview[]>>,
  setSecSnapshot: React.Dispatch<React.SetStateAction<SecSnapshot | null>>,
  setRestatements: React.Dispatch<React.SetStateAction<RestatementRef[]>>,
  withFlag: ReturnType<typeof useBusyState>["withFlag"],
) {
  return {
    submitDiscipline: async (entry: CreateDisciplineEntryInput): Promise<boolean> => {
      if (!canWrite) return false;
      const res = await withFlag("saving", () => apiPostDiscipline(thesis.id, entry));
      if (!res) return false;
      applyMutation(res);
      return true;
    },
    submitQuarterlyReview: async (input: CreateQuarterlyReviewInput): Promise<boolean> => {
      if (!canWrite) return false;
      const res = await withFlag("saving", () => apiCreateQuarterlyReview(thesis.id, input));
      if (!res) return false;
      applyMutation({ thesis: res.thesis, revisions: res.revisions });
      setReviews((prev) => [res.review, ...prev]);
      return true;
    },
    syncSec: async () => {
      const synced = await withFlag("secSyncing", () => apiSyncSec(thesis.ticker));
      if (synced?.snapshot) setSecSnapshot(synced.snapshot);
      if (synced?.restatements) setRestatements([...synced.restatements]);
    },
    deleteCurrentThesis: () => withFlag("deleting", () => apiDeleteThesis(thesis.id)),
  };
}

interface MutationSetters {
  setThesis: React.Dispatch<React.SetStateAction<ThesisDetail>>;
  setRevisions: React.Dispatch<React.SetStateAction<ThesisRevision[]>>;
  setReviews: React.Dispatch<React.SetStateAction<QuarterlyReview[]>>;
  setSecSnapshot: React.Dispatch<React.SetStateAction<SecSnapshot | null>>;
  setRestatements: React.Dispatch<React.SetStateAction<RestatementRef[]>>;
}

function useThesisMutations(
  thesis: ThesisDetail,
  canWrite: boolean,
  setters: MutationSetters,
  withFlag: ReturnType<typeof useBusyState>["withFlag"],
) {
  const latestUpdatedAtRef = useRef(thesis.updatedAt);
  latestUpdatedAtRef.current = thesis.updatedAt;
  const patchChainRef = useRef<Promise<void>>(Promise.resolve());
  const { setThesis, setRevisions, setReviews, setSecSnapshot, setRestatements } = setters;

  const applyMutation = useCallback(
    (res: ThesisMutationResult | null) => {
      if (!res) return;
      latestUpdatedAtRef.current = res.thesis.updatedAt;
      setThesis(res.thesis);
      if (res.revisions) setRevisions(res.revisions);
      broadcastThesisSync(res.thesis, res.revisions);
    },
    [setRevisions, setThesis],
  );
  const serializedPatch = createSerializedPatchStep({
    thesisId: thesis.id,
    latestUpdatedAtRef,
    patchChainRef,
    withFlag,
    applyMutation,
    setThesis,
    setRevisions,
  });
  const patchStep = (
    payload: UpdateThesisStepInput,
    okMessage?: string,
    options?: { silent?: boolean },
  ) => (canWrite ? serializedPatch(payload, okMessage, options) : Promise.resolve(false));
  const secondary = useSecondaryMutations(
    thesis,
    canWrite,
    applyMutation,
    setReviews,
    setSecSnapshot,
    setRestatements,
    withFlag,
  );
  return { applyMutation, patchStep, ...secondary };
}

export function useResearchCanvas(
  initialThesis: ThesisDetail,
  initialSec: SecSnapshot | null,
  initialCopilot: InitialCopilotState,
  initialRevisions: readonly ThesisRevision[],
  initialReviews: readonly QuarterlyReview[],
  initialResearchNotes: readonly ResearchNote[] = [],
  options?: { canWrite?: boolean; initialRestatements?: readonly RestatementRef[] },
) {
  const canWrite = options?.canWrite ?? true;
  const [thesis, setThesis] = useState(initialThesis);
  const [revisions, setRevisions] = useState<ThesisRevision[]>([...initialRevisions]);
  const [reviews, setReviews] = useState<QuarterlyReview[]>([...initialReviews]);
  const [researchNotes, setResearchNotes] = useState<ResearchNote[]>([...initialResearchNotes]);
  const [secSnapshot, setSecSnapshot] = useState(initialSec);
  const [restatements, setRestatements] = useState<RestatementRef[]>([
    ...(options?.initialRestatements ?? []),
  ]);
  const { busy, withFlag } = useBusyState();
  const { copilot, runCopilot: rawRunCopilot } = useCopilotRunner(thesis.id, initialCopilot);
  const runCopilot = (action: CopilotKind, sourceText?: string) =>
    canWrite ? rawRunCopilot(action, sourceText) : Promise.resolve();
  const actions = useThesisMutations(
    thesis,
    canWrite,
    { setThesis, setRevisions, setReviews, setSecSnapshot, setRestatements },
    withFlag,
  );
  useThesisBroadcastSync(thesis.id, thesis.updatedAt, setThesis, setRevisions);
  return {
    thesis,
    canWrite,
    revisions,
    reviews,
    researchNotes,
    setResearchNotes,
    secSnapshot,
    setSecSnapshot,
    restatements,
    ...busy,
    copilot,
    runCopilot,
    ...actions,
  };
}
