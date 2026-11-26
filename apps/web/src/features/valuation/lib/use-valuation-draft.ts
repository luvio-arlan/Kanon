"use client";

import {
  calculateSensitivityMatrix,
  calculateValuationScenarios,
  clampDisplayValuationInput,
  matchProbabilityPreset,
  type ProbabilityPreset,
  sanitizeValuationInput,
  type ThesisDetail,
  type ValuationDriverInputs,
  type ValuationInputIssue,
  type ValuationModelMode,
} from "@kanon/core";
import { useCallback, useMemo } from "react";
import { useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";
import {
  type CaseKey,
  type CaseMap,
  type CasePair,
  clampCasePatch,
  isValuationDraft,
  mapTargetsToCases,
  normalizeProbTriplet,
  type ValuationDraftState,
  type ValuationSavePayload,
} from "./valuation-draft-helpers";

export type { CaseKey, CaseMap, CasePair, ValuationDraftState, ValuationSavePayload };

function initialCasesFromThesis(thesis: ThesisDetail): CaseMap {
  const { bear, base, bull } = thesis.valuationInput;
  return {
    bear: { eps: bear.eps, peMultiple: bear.peMultiple, probability: bear.probability ?? 0.25 },
    base: { eps: base.eps, peMultiple: base.peMultiple, probability: base.probability ?? 0.5 },
    bull: { eps: bull.eps, peMultiple: bull.peMultiple, probability: bull.probability ?? 0.25 },
  };
}

function deriveMetrics(draft: ValuationDraftState) {
  const raw = {
    currentPrice: draft.currentPrice,
    horizonYears: draft.horizonYears,
    ...draft.cases,
  };
  const checked = sanitizeValuationInput(raw);
  const safeInput = checked.ok ? checked.input : clampDisplayValuationInput(raw);
  const validationIssues: ValuationInputIssue[] = checked.ok ? [] : checked.issues;
  const summary = calculateValuationScenarios(safeInput);
  const matrix = calculateSensitivityMatrix({
    currentPrice: safeInput.currentPrice,
    horizonYears: safeInput.horizonYears,
    bearEps: safeInput.bear.eps,
    baseEps: safeInput.base.eps,
    bullEps: safeInput.bull.eps,
    bearPe: safeInput.bear.peMultiple,
    basePe: safeInput.base.peMultiple,
    bullPe: safeInput.bull.peMultiple,
  });
  const activePreset = matchProbabilityPreset(
    summary.bear.probability,
    summary.base.probability,
    summary.bull.probability,
  );
  return { summary, matrix, activePreset, validationIssues, isClampedPreview: !checked.ok };
}

function applyPresetToCases(
  cases: CaseMap,
  p: Pick<ProbabilityPreset, "bear" | "base" | "bull">,
): CaseMap {
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
        cases: { ...prev.cases, [key]: clampCasePatch(prev.cases[key], next) },
      })),
    [setDraft],
  );
  const applyEvTargetPrices = useCallback(
    (targets: { bear: number; base: number; bull: number }) =>
      setDraft((prev) => ({
        ...prev,
        modelMode: "ev_fcf",
        cases: mapTargetsToCases(prev.cases, targets),
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
  const applyProbabilities = useCallback(
    (bearRaw: number, baseRaw: number, bullRaw: number) =>
      setDraft((prev) => ({
        ...prev,
        cases: applyPresetToCases(prev.cases, normalizeProbTriplet(bearRaw, baseRaw, bullRaw)),
      })),
    [setDraft],
  );
  return {
    patchCase,
    applyEvTargetPrices,
    patchDrivers,
    setModelMode,
    applyPreset,
    applyProbabilities,
  };
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
    canSaveDraft: (val) => isValuationDraft(val),
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
