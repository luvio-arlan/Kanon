"use client";

import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("button, a, [role='button'], [role='menuitem'], [role='tab']"));
}

function shouldIgnoreEvent(event: KeyboardEvent, disabled: boolean): boolean {
  return (
    disabled || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)
  );
}

interface CockpitShortcutHandlers {
  onNewThesis: () => void;
  onToggleView: () => void;
  onToggleTheme: () => void;
  onFocusSearch: () => void;
  onMoveSelection?: (delta: -1 | 1) => void;
  onOpenSelected?: () => void;
}

function buildShortcutMap(p: CockpitShortcutHandlers): Record<string, (() => void) | undefined> {
  return {
    "/": p.onFocusSearch,
    n: p.onNewThesis,
    v: p.onToggleView,
    t: p.onToggleTheme,
    j: p.onMoveSelection ? () => p.onMoveSelection?.(1) : undefined,
    k: p.onMoveSelection ? () => p.onMoveSelection?.(-1) : undefined,
    enter: p.onOpenSelected,
  };
}

export function useCockpitShortcuts(
  params: CockpitShortcutHandlers & { disabled: boolean; pausedRef?: React.RefObject<boolean> },
) {
  const { disabled, pausedRef, onNewThesis, onToggleView, onToggleTheme, onFocusSearch } = params;
  const { onMoveSelection, onOpenSelected } = params;

  useEffect(() => {
    const handlers = buildShortcutMap({
      onNewThesis,
      onToggleView,
      onToggleTheme,
      onFocusSearch,
      onMoveSelection,
      onOpenSelected,
    });
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreEvent(event, disabled || Boolean(pausedRef?.current))) return;
      const key = event.key.toLowerCase();
      if (key === "enter" && isInteractiveTarget(event.target)) return;
      const action = handlers[key];
      if (!action) return;
      event.preventDefault();
      action();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    disabled,
    pausedRef,
    onNewThesis,
    onToggleView,
    onToggleTheme,
    onFocusSearch,
    onMoveSelection,
    onOpenSelected,
  ]);
}
