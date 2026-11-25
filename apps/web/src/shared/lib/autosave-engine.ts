import { clearStoredDraft, isDraftEqual, stableDraftHash, writeStoredDraft } from "./draft-storage";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

const SPINNER_DELAY_MS = 160;
const SAVED_VISIBLE_MS = 1600;

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

export interface SchedulerRefs<T> {
  draft: T;
  serverValue: T;
  serverVersion: string;
  canSave: boolean;
  storageKey: string;
  onSave: (draft: T) => Promise<boolean | undefined>;
  onSyncChange?: (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => void;
  unmounted: boolean;
  inFlight: boolean;
  queued: boolean;
  lastStatus: AutoSaveStatus;
  lastSubmittedHash: string | null;
  lastSavedHash: string | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  storageTimer: ReturnType<typeof setTimeout> | null;
  spinnerDelayTimer: ReturnType<typeof setTimeout> | null;
  savedResetTimer: ReturnType<typeof setTimeout> | null;
}

export function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer) clearTimeout(timer);
  return null;
}

function notifyStatus<T>(
  r: SchedulerRefs<T>,
  status: AutoSaveStatus,
  flush: (() => Promise<void>) | null,
) {
  if (r.unmounted) return;
  if (r.lastStatus === status && status !== "error") return;
  r.lastStatus = status;
  r.onSyncChange?.(status, flush);
}

async function executeSave<T>(r: SchedulerRefs<T>, snapshot: T): Promise<boolean> {
  try {
    return (await r.onSave(snapshot)) !== false;
  } catch (err) {
    void err;
    return false;
  }
}

function scheduleSpinner<T>(
  r: SchedulerRefs<T>,
  flushSelf: () => Promise<void>,
  immediate: boolean,
) {
  r.spinnerDelayTimer = clearTimer(r.spinnerDelayTimer);
  if (immediate) {
    notifyStatus(r, "saving", flushSelf);
    return;
  }
  r.spinnerDelayTimer = setTimeout(() => {
    r.spinnerDelayTimer = null;
    if (r.inFlight) notifyStatus(r, "saving", flushSelf);
  }, SPINNER_DELAY_MS);
}

function markSaveSettled<T>(r: SchedulerRefs<T>) {
  clearStoredDraft(r.storageKey);
  notifyStatus(r, "saved", null);
  r.savedResetTimer = clearTimer(r.savedResetTimer);
  r.savedResetTimer = setTimeout(() => {
    r.savedResetTimer = null;
    notifyStatus(r, "idle", null);
  }, SAVED_VISIBLE_MS);
}

export async function runPersistPass<T>(
  r: SchedulerRefs<T>,
  flushSelf: () => Promise<void>,
  immediateSpinner = false,
): Promise<void> {
  const snapshot = r.draft;
  const serialized = stableDraftHash(snapshot);
  if (!r.canSave || isDraftEqual(snapshot, r.serverValue) || serialized === r.lastSavedHash) {
    if (!r.inFlight && r.lastStatus === "saving") notifyStatus(r, "idle", null);
    return;
  }
  if (r.inFlight) {
    r.queued = true;
    return;
  }
  r.savedResetTimer = clearTimer(r.savedResetTimer);
  r.inFlight = true;
  r.queued = false;
  r.lastSubmittedHash = serialized;
  scheduleSpinner(r, flushSelf, immediateSpinner);

  const ok = await executeSave(r, snapshot).finally(() => {
    r.inFlight = false;
    r.spinnerDelayTimer = clearTimer(r.spinnerDelayTimer);
  });
  if (!ok) {
    notifyStatus(r, "error", flushSelf);
    return;
  }
  r.lastSavedHash = serialized;
  if (r.queued && stableDraftHash(r.draft) !== serialized) {
    r.queued = false;
    await runPersistPass(r, flushSelf);
    return;
  }
  markSaveSettled(r);
}

export function createSchedulerRefs<T>(opts: AutoSaveSchedulerOptions<T>): SchedulerRefs<T> {
  return {
    draft: opts.draft,
    serverValue: opts.serverValue,
    serverVersion: opts.serverVersion,
    canSave: opts.canSave,
    storageKey: opts.storageKey,
    onSave: opts.onSave,
    onSyncChange: opts.onSyncChange,
    unmounted: false,
    inFlight: false,
    queued: false,
    lastStatus: "idle",
    lastSubmittedHash: null,
    lastSavedHash: null,
    debounceTimer: null,
    storageTimer: null,
    spinnerDelayTimer: null,
    savedResetTimer: null,
  };
}

export function syncSchedulerRefs<T>(r: SchedulerRefs<T>, opts: AutoSaveSchedulerOptions<T>) {
  r.draft = opts.draft;
  r.serverValue = opts.serverValue;
  r.serverVersion = opts.serverVersion;
  r.canSave = opts.canSave;
  r.storageKey = opts.storageKey;
  r.onSave = opts.onSave;
  r.onSyncChange = opts.onSyncChange;
}

export function syncDraftTimer<T>(
  r: SchedulerRefs<T>,
  params: {
    storageKey: string;
    draft: T;
    serverVersion: string;
    isDirty: boolean;
    canSave: boolean;
    debounceMs: number;
  },
  flush: () => Promise<void>,
) {
  r.debounceTimer = clearTimer(r.debounceTimer);
  r.storageTimer = clearTimer(r.storageTimer);
  if (!params.isDirty || stableDraftHash(params.draft) === r.lastSavedHash) {
    clearStoredDraft(params.storageKey);
    if (!r.inFlight && r.lastStatus !== "saved") notifyStatus(r, "idle", null);
    return;
  }
  r.storageTimer = setTimeout(() => {
    r.storageTimer = null;
    writeStoredDraft(params.storageKey, params.serverVersion, params.draft);
  }, 180);
  if (!params.canSave) {
    if (!r.inFlight) notifyStatus(r, "idle", null);
    return;
  }
  r.savedResetTimer = clearTimer(r.savedResetTimer);
  const nextStatus: AutoSaveStatus = r.inFlight && r.lastStatus === "saving" ? "saving" : "idle";
  r.lastStatus = nextStatus;
  if (!r.unmounted) r.onSyncChange?.(nextStatus, flush);
  r.debounceTimer = setTimeout(() => {
    r.debounceTimer = null;
    void runPersistPass(r, flush);
  }, params.debounceMs);
}

export function cleanupScheduler<T>(r: SchedulerRefs<T>) {
  const hadPendingStorage = r.storageTimer !== null;
  r.unmounted = true;
  r.debounceTimer = clearTimer(r.debounceTimer);
  r.storageTimer = clearTimer(r.storageTimer);
  r.spinnerDelayTimer = clearTimer(r.spinnerDelayTimer);
  r.savedResetTimer = clearTimer(r.savedResetTimer);
  if (hadPendingStorage && !isDraftEqual(r.draft, r.serverValue)) {
    writeStoredDraft(r.storageKey, r.serverVersion, r.draft);
  }
}
