const COCKPIT_RETURN_KEY = "kanon:cockpit-return-search";

/** Remembers the cockpit view (`?view=&filter=&sort=`) so returning from a thesis lands in place. */
export function rememberCockpitSearch(search: string): void {
  try {
    if (search) window.sessionStorage.setItem(COCKPIT_RETURN_KEY, search);
    else window.sessionStorage.removeItem(COCKPIT_RETURN_KEY);
  } catch (err) {
    void err;
  }
}

export function resolveCockpitHref(): string {
  try {
    const search = window.sessionStorage.getItem(COCKPIT_RETURN_KEY) ?? "";
    return search.startsWith("?") ? `/${search}` : "/";
  } catch (err) {
    void err;
    return "/";
  }
}
