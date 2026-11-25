"use client";

import { useEffect, useRef, useState } from "react";
import { isDraftEqual, readStoredDraft } from "../lib/draft-storage";
import { type AutoSaveStatus, useAutoSaveScheduler } from "./use-autosave-scheduler";
import { useDirtyGuard } from "./use-dirty-guard";

export type { AutoSaveStatus };

export interface UseThesisStepDraftOptions<T> {
  storageKey: string;
  serverValue: T;
  serverVersion: string;
  canSave?: boolean;
  canSaveDraft?: (draft: T) => boolean;
  debounceMs?: number;
  onSave: (draft: T) => Promise<boolean | undefined>;
  onSyncChange?: (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => void;
  validateStored?: (candidate: unknown) => candidate is T;
}

function loadInitialDraft<T>(
  storageKey: string,
  serverValue: T,
  serverVersion: string,
  validateStored?: (candidate: unknown) => candidate is T,
): T {
  if (!validateStored) return serverValue;
  const saved = readStoredDraft(storageKey, serverVersion, validateStored);
  return saved && !isDraftEqual(saved, serverValue) ? saved : serverValue;
}

export function useThesisStepDraft<T>(options: UseThesisStepDraftOptions<T>) {
  const { storageKey, serverValue, serverVersion, onSave, onSyncChange, validateStored } = options;
  const [draft, setDraft] = useState<T>(() =>
    loadInitialDraft(storageKey, serverValue, serverVersion, validateStored),
  );
  const prevVersionRef = useRef(serverVersion);
  const isDirty = !isDraftEqual(draft, serverValue);
  const resolvedCanSave =
    (options.canSave ?? true) && (options.canSaveDraft ? options.canSaveDraft(draft) : true);
  const scheduler = useAutoSaveScheduler({
    storageKey,
    draft,
    serverValue,
    serverVersion,
    isDirty,
    canSave: resolvedCanSave,
    debounceMs: options.debounceMs ?? 650,
    onSave,
    onSyncChange,
  });

  useDirtyGuard({ dirty: isDirty, canSave: resolvedCanSave, onSave: scheduler.flush });

  useEffect(() => {
    if (prevVersionRef.current === serverVersion) return;
    prevVersionRef.current = serverVersion;
    if (scheduler.isSelfSaveAck(serverValue)) {
      scheduler.clearSelfSaveAck();
      return;
    }
    if (!isDirty) setDraft(serverValue);
  }, [isDirty, scheduler, serverValue, serverVersion]);

  return { draft, setDraft, isDirty, save: scheduler.flush };
}
