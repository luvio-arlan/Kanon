"use client";

import { useEffect, useRef } from "react";

export function useDirtyGuard(params: {
  dirty: boolean;
  canSave: boolean;
  onSave: () => void | Promise<void>;
}) {
  const { dirty, canSave, onSave } = params;
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (canSave) {
          void saveRef.current();
        }
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dirty, canSave]);
}
