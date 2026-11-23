"use client";

import type { ThesisDetail } from "@kanon/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { readByokConfig } from "@/features/ai-settings";
import type { StepId } from "../components/canvas-chrome";
import { useCanvasShortcuts } from "./use-canvas-shortcuts";

export function useCanvasChromeState(currentId: string, allTheses: readonly ThesisDetail[]) {
  const router = useRouter();
  const [nav, setNav] = useState<{ step: StepId; dir: number }>({ step: 1, dir: 1 });
  const [focusMode, setFocusMode] = useState(false);
  const [modals, setModals] = useState({ cmd: false, ai: false, del: false });
  const [hasByok, setHasByok] = useState(false);

  useEffect(() => {
    setHasByok(Boolean(readByokConfig()));
  }, []);

  const jumpToStep = useCallback((next: StepId) => {
    setNav((prev) => ({ step: next, dir: next >= prev.step ? 1 : -1 }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const toggleFocus = useCallback(() => setFocusMode((v) => !v), []);
  const cycleThesis = useCallback(
    (delta: -1 | 1) => {
      if (allTheses.length < 2) return;
      const idx = allTheses.findIndex((item) => item.id === currentId);
      const next = allTheses[(idx + delta + allTheses.length) % allTheses.length];
      if (next) router.push(`/thesis/${next.id}`);
    },
    [allTheses, currentId, router],
  );
  const setModal = (key: "cmd" | "ai" | "del", val: boolean) =>
    setModals((prev) => ({ ...prev, [key]: val }));

  useCanvasShortcuts({
    disabled: modals.cmd || modals.ai || modals.del,
    onSelectStep: jumpToStep,
    onToggleFocus: toggleFocus,
    onCycleThesis: cycleThesis,
  });

  return { nav, focusMode, modals, hasByok, setHasByok, jumpToStep, toggleFocus, setModal };
}
