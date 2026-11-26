"use client";

import type { ThesisSummary } from "@kanon/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AutoSaveStatus } from "@/shared/hooks/use-thesis-step-draft";
import { readByokConfig } from "@/shared/lib/client-provider-storage";
import type { StepId } from "../components/canvas-chrome";
import { useCanvasShortcuts } from "./use-canvas-shortcuts";

export type CanvasModalKey = "cmd" | "ai" | "del" | "agent";

function findAdjacentThesisId(
  allTheses: readonly ThesisSummary[],
  currentId: string,
  delta: -1 | 1,
): string | null {
  if (allTheses.length < 2) return null;
  const idx = allTheses.findIndex((item) => item.id === currentId);
  return allTheses[(idx + delta + allTheses.length) % allTheses.length]?.id ?? null;
}

function useSyncTracker() {
  const [syncStatus, setSyncStatus] = useState<AutoSaveStatus>("idle");
  const flushRef = useRef<(() => Promise<void>) | null>(null);

  const setSyncState = useCallback(
    (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => {
      setSyncStatus(status);
      flushRef.current = flush;
    },
    [],
  );

  const flushPending = useCallback(async () => {
    const fn = flushRef.current;
    if (!fn) return;
    flushRef.current = null;
    await fn();
  }, []);

  return { syncStatus, flushRef, setSyncState, flushPending };
}

function syncCanvasStepUrl(currentId: string, step: StepId) {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", `/thesis/${currentId}?step=${step}`);
  if (window.scrollY > 120) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function useSeamlessNavigation(
  currentId: string,
  allTheses: readonly ThesisSummary[],
  initialStep: StepId,
) {
  const router = useRouter();
  const [nav, setNav] = useState<{ step: StepId; dir: number }>({ step: initialStep, dir: 1 });
  const sync = useSyncTracker();

  const jumpToStep = useCallback(
    (step: StepId) => {
      if (step === nav.step) return;
      if (sync.flushRef.current) void sync.flushPending();
      else sync.setSyncState("idle", null);
      setNav((prev) => ({ step, dir: step >= prev.step ? 1 : -1 }));
      syncCanvasStepUrl(currentId, step);
    },
    [currentId, nav.step, sync],
  );

  const cycleThesis = useCallback(
    (delta: -1 | 1) => {
      const nextId = findAdjacentThesisId(allTheses, currentId, delta);
      if (!nextId) return;
      const href = nav.step > 1 ? `/thesis/${nextId}?step=${nav.step}` : `/thesis/${nextId}`;
      void sync.flushPending().finally(() => router.push(href));
    },
    [allTheses, currentId, nav.step, router, sync],
  );

  return {
    nav,
    syncStatus: sync.syncStatus,
    setSyncState: sync.setSyncState,
    flushPending: sync.flushPending,
    jumpToStep,
    cycleThesis,
  };
}

export function useCanvasChromeState(
  currentId: string,
  allTheses: readonly ThesisSummary[],
  initialStep: StepId = 1,
) {
  const [focusMode, setFocusMode] = useState(false);
  const [modals, setModals] = useState({ cmd: false, ai: false, del: false, agent: false });
  const [hasByok, setHasByok] = useState(false);
  const navCtrl = useSeamlessNavigation(currentId, allTheses, initialStep);

  useEffect(() => {
    setHasByok(Boolean(readByokConfig()));
  }, []);

  const toggleFocus = useCallback(() => setFocusMode((v) => !v), []);
  const toggleAgent = useCallback(() => setModals((prev) => ({ ...prev, agent: !prev.agent })), []);

  useCanvasShortcuts({
    disabled: modals.cmd || modals.ai || modals.del || modals.agent,
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
