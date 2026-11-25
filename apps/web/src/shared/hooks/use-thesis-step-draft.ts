"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

function hydrateStoredOnce<T>(
  storageKey: string,
  serverValue: T,
  serverVersion: string,
  validateStored: ((candidate: unknown) => candidate is T) | undefined,
  refs: { hydratedKey: string | null; userEdited: boolean },
  setDraftRaw: React.Dispatch<React.SetStateAction<T>>,
) {
  if (!validateStored || refs.hydratedKey === storageKey) return;
  refs.hydratedKey = storageKey;
  if (refs.userEdited) return;
  const saved = readStoredDraft(storageKey, serverVersion, validateStored);
  if (saved && !isDraftEqual(saved, serverValue)) setDraftRaw(saved);
}

interface DraftSyncParams<T> {
  storageKey: string;
  draft: T;
  isDirty: boolean;
  serverValue: T;
  serverVersion: string;
  validateStored?: (candidate: unknown) => candidate is T;
  track: { version: string; server: T; hydratedKey: string | null; userEdited: boolean };
  scheduler: Pick<
    ReturnType<typeof useAutoSaveScheduler<T>>,
    "isSelfSaveAck" | "clearSelfSaveAck" | "resetSavedMarker"
  >;
  setDraftRaw: React.Dispatch<React.SetStateAction<T>>;
}

function syncDraftWithServer<T>(p: DraftSyncParams<T>) {
  hydrateStoredOnce(
    p.storageKey,
    p.serverValue,
    p.serverVersion,
    p.validateStored,
    p.track,
    p.setDraftRaw,
  );
  if (p.track.version === p.serverVersion) return;
  const wasClean = isDraftEqual(p.draft, p.track.server);
  p.track.version = p.serverVersion;
  p.track.server = p.serverValue;
  if (p.scheduler.isSelfSaveAck(p.serverValue)) return p.scheduler.clearSelfSaveAck();
  if (wasClean || !p.isDirty) {
    p.scheduler.resetSavedMarker();
    p.setDraftRaw(p.serverValue);
  }
}

export function useThesisStepDraft<T>(options: UseThesisStepDraftOptions<T>) {
  const { storageKey, serverValue, serverVersion, onSave, onSyncChange, validateStored } = options;
  const [draft, setDraftRaw] = useState<T>(serverValue);
  const track = useRef({
    version: serverVersion,
    server: serverValue,
    hydratedKey: null as string | null,
    userEdited: false,
  });
  const setDraft = useCallback<React.Dispatch<React.SetStateAction<T>>>((next) => {
    track.current.userEdited = true;
    setDraftRaw(next);
  }, []);
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
    debounceMs: options.debounceMs ?? 350,
    onSave,
    onSyncChange,
  });
  useDirtyGuard({ dirty: isDirty, canSave: resolvedCanSave, onSave: scheduler.flush });

  useEffect(() => {
    syncDraftWithServer({
      storageKey,
      draft,
      isDirty,
      serverValue,
      serverVersion,
      validateStored,
      track: track.current,
      scheduler,
      setDraftRaw,
    });
  }, [draft, isDirty, scheduler, serverValue, serverVersion, storageKey, validateStored]);

  return { draft, setDraft, isDirty, save: scheduler.flush };
}
