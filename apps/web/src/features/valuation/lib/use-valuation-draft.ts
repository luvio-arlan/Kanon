"use client";

import {
  calculateSensitivityMatrix,
  calculateValuationScenarios,
  matchProbabilityPreset,
  type ProbabilityPreset,
  type ThesisDetail,
  type ValuationDriverInputs,
  type ValuationModelMode,
} from "@kanon/core";
import { useCallback, useMemo } from "react";
import { useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";

export type CaseKey = "bear" | "base" | "bull";
export type CasePair = { eps: number; peMultiple: number; probability: number };
export type CaseMap = Record<CaseKey, CasePair>;

export interface ValuationDraftState {
  currentPrice: number;
  horizonYears: number;
  modelMode: ValuationModelMode;
  driverInputs: ValuationDriverInputs;
  cases: CaseMap;
}

export type ValuationSavePayload = {
  currentPrice: number;
  horizonYears: number;
  modelMode: ValuationModelMode;
  driverInputs: ValuationDriverInputs | null;
} & CaseMap;

function initialCasesFromThesis(thesis: ThesisDetail): CaseMap {
  const { bear, base, bull } = thesis.valuationInput;
  return {
    bear: { eps: bear.eps, peMultiple: bear.peMultiple, probability: bear.probability ?? 0.25 },
    base: { eps: base.eps, peMultiple: base.peMultiple, probability: base.probability ?? 0.5 },
    bull: { eps: bull.eps, peMultiple: bull.peMultiple, probability: bull.probability ?? 0.25 },
  };
}

function isValuationDraft(val: unknown): val is ValuationDraftState {
  if (!val || typeof val !== "object") return false;
  const rec = val as { currentPrice?: unknown; horizonYears?: unknown; cases?: unknown };
  return (
    typeof rec.currentPrice === "number" &&
    typeof rec.horizonYears === "number" &&
    Boolean(rec.cases && typeof rec.cases === "object")
  );
}

function deriveMetrics(draft: ValuationDraftState) {
  const safePrice = draft.currentPrice > 0 ? draft.currentPrice : 1;
  const { horizonYears, cases } = draft;
  const summary = calculateValuationScenarios({ currentPrice: safePrice, horizonYears, ...cases });
  const matrix = calculateSensitivityMatrix({
    currentPrice: safePrice,
    horizonYears,
    bearEps: cases.bear.eps,
    baseEps: cases.base.eps,
    bullEps: cases.bull.eps,
    bearPe: cases.bear.peMultiple,
    basePe: cases.base.peMultiple,
    bullPe: cases.bull.peMultiple,
  });
  const activePreset = matchProbabilityPreset(
    cases.bear.probability,
    cases.base.probability,
    cases.bull.probability,
  );
  return { summary, matrix, activePreset };
}

function applyPresetToCases(cases: CaseMap, p: ProbabilityPreset): CaseMap {
  return {
    bear: { ...cases.bear, probability: p.bear },
    base: { ...cases.base, probability: p.base },
    bull: { ...cases.bull, probability: p.bull },
  };
}

function useValuationPatchers(setDraft: React.Dispatch<React.SetStateAction<ValuationDraftState>>) {
  const patchCase = useCallback(
    (key: CaseKey, next: Partial<CasePair>) =>
      setDraft((prev) => ({
        ...prev,
        cases: { ...prev.cases, [key]: { ...prev.cases[key], ...next } },
      })),
    [setDraft],
  );
  const patchDrivers = useCallback(
    (next: Partial<ValuationDriverInputs>) =>
      setDraft((prev) => ({ ...prev, driverInputs: { ...prev.driverInputs, ...next } })),
    [setDraft],
  );
  const setModelMode = useCallback(
    (modelMode: ValuationModelMode) => setDraft((prev) => ({ ...prev, modelMode })),
    [setDraft],
  );
  const applyPreset = useCallback(
    (p: ProbabilityPreset) =>
      setDraft((prev) => ({ ...prev, cases: applyPresetToCases(prev.cases, p) })),
    [setDraft],
  );
  return { patchCase, patchDrivers, setModelMode, applyPreset };
}

export function useValuationDraft(params: {
  thesis: ThesisDetail;
  onSyncChange?: (
    status: import("@/shared/hooks/use-thesis-step-draft").AutoSaveStatus,
    flush: (() => Promise<void>) | null,
  ) => void;
  onSave: (payload: ValuationSavePayload) => Promise<boolean>;
}) {
  const { thesis, onSyncChange, onSave } = params;
  const serverValue = useMemo<ValuationDraftState>(
    () => ({
      currentPrice: thesis.currentPrice,
      horizonYears: thesis.horizonYears,
      modelMode: thesis.valuationModelMode ?? "pe",
      driverInputs: thesis.valuationDriverInputs ?? {},
      cases: initialCasesFromThesis(thesis),
    }),
    [thesis],
  );
  const store = useThesisStepDraft({
    storageKey: `kanon-draft:${thesis.id}:step4`,
    serverValue,
    serverVersion: thesis.updatedAt,
    canSaveDraft: (val) =>
      val.currentPrice > 0 &&
      val.cases.bear.eps > 0 &&
      val.cases.base.eps > 0 &&
      val.cases.bull.eps > 0,
    onSyncChange,
    validateStored: isValuationDraft,
    onSave: (val) =>
      onSave({
        currentPrice: val.currentPrice > 0 ? val.currentPrice : 1,
        horizonYears: val.horizonYears,
        modelMode: val.modelMode,
        driverInputs: Object.keys(val.driverInputs).length > 0 ? val.driverInputs : null,
        ...val.cases,
      }),
  });
  const patchers = useValuationPatchers(store.setDraft);
  return { store, ...store.draft, ...deriveMetrics(store.draft), ...patchers };
}
