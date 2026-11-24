"use client";

import type { ThesisSummary } from "@kanon/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { readByokConfig } from "@/features/ai-settings";
import type { StepId } from "../components/canvas-chrome";
import { useCanvasShortcuts } from "./use-canvas-shortcuts";

export type CanvasModalKey = "cmd" | "ai" | "del" | "agent";
export type PendingNavTarget = { type: "step"; step: StepId } | { type: "thesis"; id: string };

function findAdjacentThesisId(
  allTheses: readonly ThesisSummary[],
  currentId: string,
  delta: -1 | 1,
): string | null {
  if (allTheses.length < 2) return null;
  const idx = allTheses.findIndex((item) => item.id === currentId);
  return allTheses[(idx + delta + allTheses.length) % allTheses.length]?.id ?? null;
}

function useDirtyTracker() {
  const dirtyRef = useRef(false);
  const saveActionRef = useRef<(() => Promise<void>) | null>(null);
  const setDirtyState = useCallback((dirty: boolean, saveAction: (() => Promise<void>) | null) => {
    dirtyRef.current = dirty;
    saveActionRef.current = saveAction;
  }, []);
  return { dirtyRef, saveActionRef, setDirtyState };
}

function syncCanvasStepUrl(currentId: string, step: StepId) {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", `/thesis/${currentId}?step=${step}`);
  if (window.scrollY > 120) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function useGuardedNavigation(
  currentId: string,
  allTheses: readonly ThesisSummary[],
  initialStep: StepId,
) {
  const router = useRouter();
  const [nav, setNav] = useState<{ step: StepId; dir: number }>({ step: initialStep, dir: 1 });
  const [pendingNav, setPendingNav] = useState<PendingNavTarget | null>(null);
  const { dirtyRef, saveActionRef, setDirtyState } = useDirtyTracker();

  const executeNav = useCallback(
    (target: PendingNavTarget) => {
      if (target.type === "thesis") return router.push(`/thesis/${target.id}`);
      setNav((prev) => ({ step: target.step, dir: target.step >= prev.step ? 1 : -1 }));
      syncCanvasStepUrl(currentId, target.step);
    },
    [currentId, router],
  );
  const requestNav = useCallback(
    (target: PendingNavTarget) => {
      if (target.type === "step" && target.step === nav.step) return;
      if (dirtyRef.current) setPendingNav(target);
      else executeNav(target);
    },
    [dirtyRef, executeNav, nav.step],
  );
  const resolvePendingNav = useCallback(
    async (mode: "save" | "discard" | "cancel") => {
      const target = pendingNav;
      setPendingNav(null);
      if (!target || mode === "cancel") return;
      if (mode === "save" && saveActionRef.current) await saveActionRef.current();
      dirtyRef.current = false;
      executeNav(target);
    },
    [dirtyRef, executeNav, pendingNav, saveActionRef],
  );
  const cycleThesis = useCallback(
    (delta: -1 | 1) => {
      const nextId = findAdjacentThesisId(allTheses, currentId, delta);
      if (nextId) requestNav({ type: "thesis", id: nextId });
    },
    [allTheses, currentId, requestNav],
  );
  const jumpToStep = useCallback(
    (step: StepId) => requestNav({ type: "step", step }),
    [requestNav],
  );
  return { nav, pendingNav, setDirtyState, resolvePendingNav, jumpToStep, cycleThesis };
}

export function useCanvasChromeState(
  currentId: string,
  allTheses: readonly ThesisSummary[],
  initialStep: StepId = 1,
) {
  const [focusMode, setFocusMode] = useState(false);
  const [modals, setModals] = useState({ cmd: false, ai: false, del: false, agent: false });
  const [hasByok, setHasByok] = useState(false);
  const navCtrl = useGuardedNavigation(currentId, allTheses, initialStep);

  useEffect(() => {
    setHasByok(Boolean(readByokConfig()));
  }, []);

  const toggleFocus = useCallback(() => setFocusMode((v) => !v), []);
  const toggleAgent = useCallback(() => setModals((prev) => ({ ...prev, agent: !prev.agent })), []);

  useCanvasShortcuts({
    disabled: modals.cmd || modals.ai || modals.del || modals.agent || navCtrl.pendingNav !== null,
    onSelectStep: navCtrl.jumpToStep,
    onToggleFocus: toggleFocus,
    onToggleAgent: toggleAgent,
    onCycleThesis: navCtrl.cycleThesis,
  });

  return {
    ...navCtrl,
    focusMode,
    modals,
    hasByok,
    setHasByok,
    toggleFocus,
    setModal: (key: CanvasModalKey, val: boolean) => setModals((prev) => ({ ...prev, [key]: val })),
  };
}
