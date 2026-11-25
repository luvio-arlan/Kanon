"use client";

import { useCallback, useEffect, useRef } from "react";
import { clearStoredDraft, isDraftEqual, writeStoredDraft } from "../lib/draft-storage";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export interface AutoSaveSchedulerOptions<T> {
  storageKey: string;
  draft: T;
  serverValue: T;
  serverVersion: string;
  isDirty: boolean;
  canSave: boolean;
  debounceMs: number;
  onSave: (draft: T) => Promise<boolean | undefined>;
  onSyncChange?: (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => void;
}

interface SchedulerRefs<T> {
  draft: T;
  serverValue: T;
  canSave: boolean;
  storageKey: string;
  onSave: (draft: T) => Promise<boolean | undefined>;
  onSyncChange?: (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => void;
  inFlight: boolean;
  queued: boolean;
  lastSubmittedJson: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  savedResetTimer: ReturnType<typeof setTimeout> | null;
}

function clearTimers<T>(r: SchedulerRefs<T>) {
  if (r.timer) {
    clearTimeout(r.timer);
    r.timer = null;
  }
  if (r.savedResetTimer) {
    clearTimeout(r.savedResetTimer);
    r.savedResetTimer = null;
  }
}

async function executeSave<T>(r: SchedulerRefs<T>, snapshot: T): Promise<boolean> {
  try {
    return (await r.onSave(snapshot)) !== false;
  } catch (err) {
    void err;
    return false;
  }
}

async function runPersistPass<T>(
  r: SchedulerRefs<T>,
  flushSelf: () => Promise<void>,
): Promise<void> {
  const snapshot = r.draft;
  if (!r.canSave || isDraftEqual(snapshot, r.serverValue)) return;
  const serialized = JSON.stringify(snapshot);
  if (r.inFlight) {
    r.queued = true;
    return;
  }
  r.inFlight = true;
  r.queued = false;
  r.lastSubmittedJson = serialized;
  r.onSyncChange?.("saving", flushSelf);

  const ok = await executeSave(r, snapshot).finally(() => {
    r.inFlight = false;
  });
  if (!ok) {
    r.onSyncChange?.("error", flushSelf);
    return;
  }
  if (r.queued && JSON.stringify(r.draft) !== serialized) {
    r.queued = false;
    await runPersistPass(r, flushSelf);
    return;
  }
  clearStoredDraft(r.storageKey);
  r.onSyncChange?.("saved", null);
  r.savedResetTimer = setTimeout(() => r.onSyncChange?.("idle", null), 1500);
}

function createSchedulerRefs<T>(opts: AutoSaveSchedulerOptions<T>): SchedulerRefs<T> {
  return {
    draft: opts.draft,
    serverValue: opts.serverValue,
    canSave: opts.canSave,
    storageKey: opts.storageKey,
    onSave: opts.onSave,
    onSyncChange: opts.onSyncChange,
    inFlight: false,
    queued: false,
    lastSubmittedJson: null,
    timer: null,
    savedResetTimer: null,
  };
}

function syncSchedulerRefs<T>(r: SchedulerRefs<T>, opts: AutoSaveSchedulerOptions<T>) {
  r.draft = opts.draft;
  r.serverValue = opts.serverValue;
  r.canSave = opts.canSave;
  r.storageKey = opts.storageKey;
  r.onSave = opts.onSave;
  r.onSyncChange = opts.onSyncChange;
}

export function useAutoSaveScheduler<T>(opts: AutoSaveSchedulerOptions<T>) {
  const refs = useRef<SchedulerRefs<T>>(createSchedulerRefs(opts));
  syncSchedulerRefs(refs.current, opts);

  const flush = useCallback(async () => {
    clearTimers(refs.current);
    await runPersistPass(refs.current, flush);
  }, []);

  useEffect(() => {
    const r = refs.current;
    if (!opts.isDirty) {
      clearStoredDraft(opts.storageKey);
      if (r.timer) clearTimeout(r.timer);
      r.timer = null;
      return;
    }
    writeStoredDraft(opts.storageKey, opts.serverVersion, opts.draft);
    if (!opts.canSave) return;
    if (r.timer) clearTimeout(r.timer);
    r.onSyncChange?.("saving", flush);
    r.timer = setTimeout(() => {
      r.timer = null;
      void runPersistPass(r, flush);
    }, opts.debounceMs);
    return () => clearTimers(r);
  }, [
    opts.canSave,
    opts.debounceMs,
    opts.draft,
    opts.isDirty,
    opts.serverVersion,
    opts.storageKey,
    flush,
  ]);

  return {
    flush,
    isSelfSaveAck: (candidate: T) =>
      refs.current.lastSubmittedJson !== null &&
      JSON.stringify(candidate) === refs.current.lastSubmittedJson,
    clearSelfSaveAck: () => {
      refs.current.lastSubmittedJson = null;
    },
  };
}
