export function isDraftEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface StoredEnvelope {
  baseVersion: string;
  value: unknown;
}

function isEnvelope(raw: unknown): raw is StoredEnvelope {
  if (!raw || typeof raw !== "object") return false;
  const rec = raw as { baseVersion?: unknown; value?: unknown };
  return typeof rec.baseVersion === "string" && "value" in rec;
}

export function readStoredDraft<T>(
  storageKey: string,
  expectedVersion: string,
  validate: (candidate: unknown) => candidate is T,
): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isEnvelope(parsed) || parsed.baseVersion !== expectedVersion) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    return validate(parsed.value) ? parsed.value : null;
  } catch (err) {
    void err;
    return null;
  }
}

export function writeStoredDraft(storageKey: string, baseVersion: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ baseVersion, value }));
    return true;
  } catch (err) {
    void err;
    return false;
  }
}

export function clearStoredDraft(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(storageKey);
    return true;
  } catch (err) {
    void err;
    return false;
  }
}
