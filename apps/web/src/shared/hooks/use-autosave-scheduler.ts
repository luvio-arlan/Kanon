"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  type AutoSaveSchedulerOptions,
  type AutoSaveStatus,
  cleanupScheduler,
  clearTimer,
  createSchedulerRefs,
  runPersistPass,
  type SchedulerRefs,
  syncDraftTimer,
  syncSchedulerRefs,
} from "../lib/autosave-engine";
import { stableDraftHash } from "../lib/draft-storage";
import { useOnUnmount } from "./use-on-unmount";

export type { AutoSaveSchedulerOptions, AutoSaveStatus };

export function useAutoSaveScheduler<T>(opts: AutoSaveSchedulerOptions<T>) {
  const { canSave, debounceMs, draft, isDirty, serverVersion, storageKey } = opts;
  const refs = useRef<SchedulerRefs<T>>(createSchedulerRefs(opts));
  refs.current.unmounted = false;
  syncSchedulerRefs(refs.current, opts);

  const flush = useCallback(async () => {
    const r = refs.current;
    r.debounceTimer = clearTimer(r.debounceTimer);
    r.storageTimer = clearTimer(r.storageTimer);
    await runPersistPass(r, flush, true);
  }, []);

  useOnUnmount(() => cleanupScheduler(refs.current));

  useEffect(() => {
    const r = refs.current;
    syncDraftTimer(r, { canSave, debounceMs, draft, isDirty, serverVersion, storageKey }, flush);
    return () => {
      r.debounceTimer = clearTimer(r.debounceTimer);
      r.storageTimer = clearTimer(r.storageTimer);
    };
  }, [canSave, debounceMs, draft, isDirty, serverVersion, storageKey, flush]);

  return {
    flush,
    isSelfSaveAck: (candidate: T) => {
      const h = stableDraftHash(candidate);
      return (
        (refs.current.lastSubmittedHash !== null && h === refs.current.lastSubmittedHash) ||
        (refs.current.lastSavedHash !== null && h === refs.current.lastSavedHash)
      );
    },
    clearSelfSaveAck: () => {
      refs.current.lastSubmittedHash = null;
    },
    resetSavedMarker: () => {
      refs.current.lastSavedHash = null;
    },
  };
}
