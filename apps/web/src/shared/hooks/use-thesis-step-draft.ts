"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearStoredDraft,
  isDraftEqual,
  readStoredDraft,
  writeStoredDraft,
} from "../lib/draft-storage";
import { useDirtyGuard } from "./use-dirty-guard";

export interface UseThesisStepDraftOptions<T> {
  storageKey: string;
  serverValue: T;
  serverVersion: string;
  canSave?: boolean;
  onSave: (draft: T) => Promise<void>;
  onDirtyChange?: (dirty: boolean, saveAction: (() => Promise<void>) | null) => void;
  validateStored?: (candidate: unknown) => candidate is T;
}

const MAX_UNDO_HISTORY = 12;

function loadInitialRecovered<T>(
  storageKey: string,
  serverValue: T,
  validateStored?: (candidate: unknown) => candidate is T,
): T | null {
  if (!validateStored) return null;
  const saved = readStoredDraft(storageKey, validateStored);
  return saved && !isDraftEqual(saved, serverValue) ? saved : null;
}

function useDraftUndoState<T>(serverValue: T) {
  const [draft, setDraftState] = useState<T>(serverValue);
  const [undoStack, setUndoStack] = useState<T[]>([]);

  const setDraft = useCallback((updater: T | ((prev: T) => T)) => {
    setDraftState((prev) => {
      const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
      if (!isDraftEqual(prev, next)) {
        setUndoStack((hist) => [...hist.slice(-(MAX_UNDO_HISTORY - 1)), prev]);
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setUndoStack((hist) => {
      const last = hist[hist.length - 1];
      if (last === undefined) return hist;
      setDraftState(last);
      return hist.slice(0, -1);
    });
  }, []);

  return { draft, setDraftState, setDraft, undoStack, setUndoStack, undo };
}

function useRecoveredDraft<T>(
  storageKey: string,
  serverValue: T,
  setDraftState: (v: T) => void,
  validateStored?: (candidate: unknown) => candidate is T,
) {
  const [recovered, setRecovered] = useState<T | null>(() =>
    loadInitialRecovered(storageKey, serverValue, validateStored),
  );
  return {
    hasRecoveredDraft: recovered !== null,
    clearRecovered: () => setRecovered(null),
    restoreRecovered: () => {
      if (!recovered) return;
      setDraftState(recovered);
      setRecovered(null);
    },
    dismissRecovered: () => {
      setRecovered(null);
      clearStoredDraft(storageKey);
    },
  };
}

export function useThesisStepDraft<T>(options: UseThesisStepDraftOptions<T>) {
  const { storageKey, serverValue, serverVersion, onSave, onDirtyChange, validateStored } = options;
  const state = useDraftUndoState(serverValue);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const rec = useRecoveredDraft(storageKey, serverValue, state.setDraftState, validateStored);
  const prevVersionRef = useRef(serverVersion);
  const isDirty = !isDraftEqual(state.draft, serverValue);

  const save = useCallback(async () => {
    await onSave(state.draft);
    clearStoredDraft(storageKey);
    rec.clearRecovered();
    setRemoteChanged(false);
    state.setUndoStack([]);
  }, [onSave, rec, state, storageKey]);

  useDirtyGuard({ dirty: isDirty, canSave: options.canSave ?? true, onSave: save });

  useEffect(() => {
    if (prevVersionRef.current !== serverVersion) {
      prevVersionRef.current = serverVersion;
      if (isDirty) setRemoteChanged(true);
      else state.setDraftState(serverValue);
    }
    if (isDirty) writeStoredDraft(storageKey, state.draft);
    else clearStoredDraft(storageKey);
    onDirtyChange?.(isDirty, isDirty ? save : null);
    return () => onDirtyChange?.(false, null);
  }, [isDirty, onDirtyChange, save, serverValue, serverVersion, state, storageKey]);

  const revert = useCallback(() => {
    state.setDraftState(serverValue);
    state.setUndoStack([]);
    setRemoteChanged(false);
    clearStoredDraft(storageKey);
  }, [serverValue, state, storageKey]);

  return {
    draft: state.draft,
    setDraft: state.setDraft,
    isDirty,
    canUndo: state.undoStack.length > 0,
    undo: state.undo,
    revert,
    save,
    remoteChanged,
    acceptRemote: revert,
    ...rec,
  };
}
