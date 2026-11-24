"use client";

import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function shouldIgnoreEvent(event: KeyboardEvent, disabled: boolean): boolean {
  return (
    disabled || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)
  );
}

export function useCockpitShortcuts(params: {
  disabled: boolean;
  onNewThesis: () => void;
  onToggleView: () => void;
  onToggleTheme: () => void;
  onFocusSearch: () => void;
}) {
  const { disabled, onNewThesis, onToggleView, onToggleTheme, onFocusSearch } = params;

  useEffect(() => {
    const handlers: Record<string, () => void> = {
      "/": onFocusSearch,
      n: onNewThesis,
      v: onToggleView,
      t: onToggleTheme,
    };
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreEvent(event, disabled)) return;
      const action = handlers[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, onNewThesis, onToggleView, onToggleTheme, onFocusSearch]);
}
