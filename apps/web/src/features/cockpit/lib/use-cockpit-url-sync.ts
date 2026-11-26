"use client";

import { useEffect } from "react";
import { rememberCockpitSearch } from "@/shared/lib/cockpit-return";
import { buildCockpitViewSearch, type CockpitViewState } from "./cockpit-view-params";

/** Silently mirrors the active cockpit view into the address bar (zero navigation, zero re-render). */
export function useCockpitUrlSync({ viewMode, filter, sortBy }: CockpitViewState) {
  useEffect(() => {
    const nextSearch = buildCockpitViewSearch({ viewMode, filter, sortBy });
    rememberCockpitSearch(nextSearch);
    if (window.location.search === nextSearch) return;
    const url = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, [viewMode, filter, sortBy]);
}
