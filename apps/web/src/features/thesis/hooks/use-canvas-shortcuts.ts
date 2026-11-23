"use client";

import { useEffect } from "react";
import type { StepId } from "../components/canvas-chrome";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function shouldIgnoreShortcut(event: KeyboardEvent, disabled: boolean): boolean {
  return (
    disabled || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)
  );
}

function dispatchShortcut(
  key: string,
  event: KeyboardEvent,
  handlers: {
    onSelectStep: (step: StepId) => void;
    onToggleFocus: () => void;
    onCycleThesis: (delta: -1 | 1) => void;
  },
) {
  if (key >= "1" && key <= "5") {
    handlers.onSelectStep(Number(key) as StepId);
    return;
  }
  if (key === "f") {
    event.preventDefault();
    handlers.onToggleFocus();
    return;
  }
  if (key === "[") handlers.onCycleThesis(-1);
  if (key === "]") handlers.onCycleThesis(1);
}

export function useCanvasShortcuts(params: {
  disabled: boolean;
  onSelectStep: (step: StepId) => void;
  onToggleFocus: () => void;
  onCycleThesis: (delta: -1 | 1) => void;
}) {
  const { disabled, onSelectStep, onToggleFocus, onCycleThesis } = params;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreShortcut(event, disabled)) return;
      dispatchShortcut(event.key.toLowerCase(), event, {
        onSelectStep,
        onToggleFocus,
        onCycleThesis,
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, onSelectStep, onToggleFocus, onCycleThesis]);
}
