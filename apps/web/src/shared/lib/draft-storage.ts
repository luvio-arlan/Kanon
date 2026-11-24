export function isDraftEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function readStoredDraft<T>(
  storageKey: string,
  validate: (candidate: unknown) => candidate is T,
): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch (err) {
    void err;
    return null;
  }
}

export function writeStoredDraft(storageKey: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
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
