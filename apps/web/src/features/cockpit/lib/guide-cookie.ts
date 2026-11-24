import { calculateResearchReadiness, type ThesisDetail } from "@kanon/core";

const GUIDE_COOKIE = "kanon_guide_dismissed";

interface BrowserCookieStore {
  set: (opts: {
    name: string;
    value: string;
    path: string;
    expires: number;
    sameSite: "lax";
  }) => Promise<void>;
  delete: (opts: { name: string; path: string }) => Promise<void>;
}

export function writeGuideDismissedCookie(dismissed: boolean) {
  if (typeof window === "undefined") return;
  const store = (window as Window & { cookieStore?: BrowserCookieStore }).cookieStore;
  if (!store) return;
  if (dismissed) {
    const expires = Date.now() + 365 * 24 * 60 * 60 * 1000;
    void store.set({ name: GUIDE_COOKIE, value: "1", path: "/", expires, sameSite: "lax" });
    return;
  }
  void store.delete({ name: GUIDE_COOKIE, path: "/" });
}

export function shouldShowGuideByDefault(
  theses: readonly ThesisDetail[],
  dismissed: boolean,
): boolean {
  if (dismissed) return false;
  const active = theses.filter((t) => t.status !== "archived_veto");
  if (active.length === 0) return true;
  return !active.some((t) => calculateResearchReadiness(t).completedCount >= 5);
}
