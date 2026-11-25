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
  apiGetThesis,
  apiPatchStep,
  apiPostDiscipline,
  apiRunCopilot,
  apiSyncSec,
  type CopilotKind,
  type CopilotResult,
  type ThesisMutationResult,
} from "./canvas-api";
import { broadcastThesisSync, useThesisBroadcastSync } from "./use-thesis-broadcast";

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
  applyMutation: (res: ThesisMutationResult | null) => void,
  setReviews: React.Dispatch<React.SetStateAction<QuarterlyReview[]>>,
  setSecSnapshot: React.Dispatch<React.SetStateAction<SecSnapshot | null>>,
  withFlag: ReturnType<typeof useBusyState>["withFlag"],
) {
  return {
    submitDiscipline: async (entry: CreateDisciplineEntryInput): Promise<boolean> => {
      const res = await withFlag("saving", () => apiPostDiscipline(thesis.id, entry));
      if (!res) return false;
      applyMutation(res);
      return true;
    },
    submitQuarterlyReview: async (input: CreateQuarterlyReviewInput): Promise<boolean> => {
      const res = await withFlag("saving", () => apiCreateQuarterlyReview(thesis.id, input));
      if (!res) return false;
      applyMutation({ thesis: res.thesis, revisions: res.revisions });
      setReviews((prev) => [res.review, ...prev]);
      return true;
    },
    syncSec: async () => {
      const snap = await withFlag("secSyncing", () => apiSyncSec(thesis.ticker));
      if (snap) setSecSnapshot(snap);
    },
    deleteCurrentThesis: () => withFlag("deleting", () => apiDeleteThesis(thesis.id)),
  };
}

async function syncLatestOnConflict(deps: {
  thesisId: string;
  latestUpdatedAtRef: React.MutableRefObject<string>;
  setThesis: React.Dispatch<React.SetStateAction<ThesisDetail>>;
  setRevisions: React.Dispatch<React.SetStateAction<ThesisRevision[]>>;
}) {
  const fresh = await apiGetThesis(deps.thesisId);
  if (!fresh) return;
  deps.latestUpdatedAtRef.current = fresh.thesis.updatedAt;
  deps.setThesis(fresh.thesis);
  if (fresh.revisions) deps.setRevisions(fresh.revisions);
}

function createSerializedPatchStep(deps: {
  thesisId: string;
  latestUpdatedAtRef: React.MutableRefObject<string>;
  patchChainRef: React.MutableRefObject<Promise<void>>;
  withFlag: ReturnType<typeof useBusyState>["withFlag"];
  applyMutation: (res: ThesisMutationResult | null) => void;
  setThesis: React.Dispatch<React.SetStateAction<ThesisDetail>>;
  setRevisions: React.Dispatch<React.SetStateAction<ThesisRevision[]>>;
}) {
  const execute = async (
    payload: UpdateThesisStepInput,
    okMessage?: string,
    options?: { silent?: boolean },
  ): Promise<boolean> => {
    const run = () =>
      apiPatchStep(deps.thesisId, payload, okMessage, {
        ...options,
        expectedUpdatedAt: deps.latestUpdatedAtRef.current,
      });
    const out = options?.silent ? await run() : await deps.withFlag("saving", run);
    if (out.kind === "conflict") {
      await syncLatestOnConflict(deps);
      return false;
    }
    if (out.kind !== "ok") return false;
    deps.applyMutation({ thesis: out.thesis, revisions: out.revisions });
    return true;
  };
  return (payload: UpdateThesisStepInput, okMessage?: string, options?: { silent?: boolean }) => {
    const task = deps.patchChainRef.current.then(() => execute(payload, okMessage, options));
    deps.patchChainRef.current = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };
}

function useThesisMutations(
  thesis: ThesisDetail,
  setThesis: React.Dispatch<React.SetStateAction<ThesisDetail>>,
  setRevisions: React.Dispatch<React.SetStateAction<ThesisRevision[]>>,
  setReviews: React.Dispatch<React.SetStateAction<QuarterlyReview[]>>,
  setSecSnapshot: React.Dispatch<React.SetStateAction<SecSnapshot | null>>,
  withFlag: ReturnType<typeof useBusyState>["withFlag"],
) {
  const latestUpdatedAtRef = useRef(thesis.updatedAt);
  latestUpdatedAtRef.current = thesis.updatedAt;
  const patchChainRef = useRef<Promise<void>>(Promise.resolve());

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
  const patchStep = createSerializedPatchStep({
    thesisId: thesis.id,
    latestUpdatedAtRef,
    patchChainRef,
    withFlag,
    applyMutation,
    setThesis,
    setRevisions,
  });
  const secondary = useSecondaryMutations(
    thesis,
    applyMutation,
    setReviews,
    setSecSnapshot,
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
) {
  const [thesis, setThesis] = useState(initialThesis);
  const [revisions, setRevisions] = useState<ThesisRevision[]>([...initialRevisions]);
  const [reviews, setReviews] = useState<QuarterlyReview[]>([...initialReviews]);
  const [researchNotes, setResearchNotes] = useState<ResearchNote[]>([...initialResearchNotes]);
  const [secSnapshot, setSecSnapshot] = useState(initialSec);
  const { busy, withFlag } = useBusyState();
  const { copilot, runCopilot } = useCopilotRunner(thesis.id, initialCopilot);
  const actions = useThesisMutations(
    thesis,
    setThesis,
    setRevisions,
    setReviews,
    setSecSnapshot,
    withFlag,
  );
  useThesisBroadcastSync(thesis.id, thesis.updatedAt, setThesis, setRevisions);

  return {
    thesis,
    revisions,
    reviews,
    researchNotes,
    setResearchNotes,
    secSnapshot,
    setSecSnapshot,
    ...busy,
    copilot,
    runCopilot,
    ...actions,
  };
}
