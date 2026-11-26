import type { CockpitFilter, CockpitSortBy, CockpitViewMode } from "../components/cockpit-header";

export interface CockpitViewState {
  viewMode: CockpitViewMode;
  filter: CockpitFilter;
  sortBy: CockpitSortBy;
}

export const DEFAULT_COCKPIT_VIEW: CockpitViewState = {
  viewMode: "cards",
  filter: "all",
  sortBy: "index",
};

const VIEW_MODES: readonly CockpitViewMode[] = ["cards", "table", "catalysts", "comps"];
const FILTERS: readonly CockpitFilter[] = ["all", "attractive", "attention", "archived"];
const SORTS: readonly CockpitSortBy[] = ["index", "odds", "cagr", "margin"];

type RawSearchParams = Record<string, string | string[] | undefined>;

function pickAllowed<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return allowed.find((item) => item === value) ?? fallback;
}

/** Whitelisted `?view=&filter=&sort=` parsing so cockpit views survive reloads & back navigation. */
export function parseCockpitViewState(params: RawSearchParams): CockpitViewState {
  return {
    viewMode: pickAllowed(params.view, VIEW_MODES, DEFAULT_COCKPIT_VIEW.viewMode),
    filter: pickAllowed(params.filter, FILTERS, DEFAULT_COCKPIT_VIEW.filter),
    sortBy: pickAllowed(params.sort, SORTS, DEFAULT_COCKPIT_VIEW.sortBy),
  };
}

export function buildCockpitViewSearch(state: CockpitViewState): string {
  const params = new URLSearchParams();
  if (state.viewMode !== DEFAULT_COCKPIT_VIEW.viewMode) params.set("view", state.viewMode);
  if (state.filter !== DEFAULT_COCKPIT_VIEW.filter) params.set("filter", state.filter);
  if (state.sortBy !== DEFAULT_COCKPIT_VIEW.sortBy) params.set("sort", state.sortBy);
  const search = params.toString();
  return search ? `?${search}` : "";
}
