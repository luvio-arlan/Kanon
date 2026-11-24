"use client";

import type { ThesisSummary } from "@kanon/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { readByokConfig } from "@/features/ai-settings";
import type { StepId } from "../components/canvas-chrome";
import { useCanvasShortcuts } from "./use-canvas-shortcuts";

export type CanvasModalKey = "cmd" | "ai" | "del" | "agent";

export function useCanvasChromeState(currentId: string, allTheses: readonly ThesisSummary[]) {
  const router = useRouter();
  const [nav, setNav] = useState<{ step: StepId; dir: number }>({ step: 1, dir: 1 });
  const [focusMode, setFocusMode] = useState(false);
  const [modals, setModals] = useState({ cmd: false, ai: false, del: false, agent: false });
  const [hasByok, setHasByok] = useState(false);

  useEffect(() => {
    setHasByok(Boolean(readByokConfig()));
  }, []);

  const jumpToStep = useCallback((next: StepId) => {
    setNav((prev) => ({ step: next, dir: next >= prev.step ? 1 : -1 }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const toggleFocus = useCallback(() => setFocusMode((v) => !v), []);
  const toggleAgent = useCallback(() => setModals((prev) => ({ ...prev, agent: !prev.agent })), []);
  const cycleThesis = useCallback(
    (delta: -1 | 1) => {
      if (allTheses.length < 2) return;
      const idx = allTheses.findIndex((item) => item.id === currentId);
      const next = allTheses[(idx + delta + allTheses.length) % allTheses.length];
      if (next) router.push(`/thesis/${next.id}`);
    },
    [allTheses, currentId, router],
  );
  const setModal = (key: CanvasModalKey, val: boolean) =>
    setModals((prev) => ({ ...prev, [key]: val }));

  useCanvasShortcuts({
    disabled: modals.cmd || modals.ai || modals.del || modals.agent,
    onSelectStep: jumpToStep,
    onToggleFocus: toggleFocus,
    onToggleAgent: toggleAgent,
    onCycleThesis: cycleThesis,
  });

  return { nav, focusMode, modals, hasByok, setHasByok, jumpToStep, toggleFocus, setModal };
}
