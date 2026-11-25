"use client";

import { calculateImpliedExpectations, type GlossaryTerm, type ThesisDetail } from "@kanon/core";
import { useTheme } from "@kanon/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readByokConfig } from "@/features/ai-settings";
import type {
  CockpitFilter,
  CockpitFilterCounts,
  CockpitSortBy,
  CockpitViewMode,
} from "../components/cockpit-header";
import { buildCockpitCommandGroups } from "../data/command-actions";
import { useCockpitShortcuts } from "./use-cockpit-shortcuts";

function matchesQuery(thesis: ThesisDetail, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${thesis.ticker} ${thesis.companyName} ${thesis.sectorTag}`.toLowerCase().includes(q);
}

function matchesFilter(thesis: ThesisDetail, filter: CockpitFilter, query: string): boolean {
  if (!matchesQuery(thesis, query)) return false;
  if (filter === "archived") return thesis.status === "archived_veto";
  if (thesis.status === "archived_veto") return false;
  if (filter === "attractive") return thesis.valuation.convictionZone === "attractive";
  if (filter === "attention") return thesis.hypotheses.some((h) => h.status === "warning");
  return true;
}

function computeFilterCounts(theses: readonly ThesisDetail[], query: string): CockpitFilterCounts {
  let all = 0;
  let attractive = 0;
  let attention = 0;
  let archived = 0;
  for (const t of theses) {
    if (!matchesQuery(t, query)) continue;
    if (t.status === "archived_veto") {
      archived += 1;
      continue;
    }
    all += 1;
    if (t.valuation.convictionZone === "attractive") attractive += 1;
    if (t.hypotheses.some((h) => h.status === "warning")) attention += 1;
  }
  return { all, attractive, attention, archived };
}

function sortTheses(items: readonly ThesisDetail[], sortBy: CockpitSortBy): ThesisDetail[] {
  const copy = [...items];
  if (sortBy === "odds") {
    return copy.sort(
      (a, b) => (b.valuation.riskRewardRatio ?? 99) - (a.valuation.riskRewardRatio ?? 99),
    );
  }
  if (sortBy === "cagr") {
    return copy.sort((a, b) => b.valuation.base.cagrPct - a.valuation.base.cagrPct);
  }
  if (sortBy === "margin") {
    return copy.sort(
      (a, b) =>
        calculateImpliedExpectations({ summary: b.valuation }).marginOfSafetyPct -
        calculateImpliedExpectations({ summary: a.valuation }).marginOfSafetyPct,
    );
  }
  return copy.sort((a, b) => Number(a.indexLabel) - Number(b.indexLabel));
}

function useCockpitCollection(initialTheses: ThesisDetail[]) {
  const [theses, setTheses] = useState<ThesisDetail[]>(initialTheses);
  const [filter, setFilter] = useState<CockpitFilter>("all");
  const [sortBy, setSortBy] = useState<CockpitSortBy>("index");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<CockpitViewMode>("cards");
  const [previewThesis, setPreviewThesis] = useState<ThesisDetail | null>(null);

  const visibleTheses = useMemo(
    () =>
      sortTheses(
        theses.filter((t) => matchesFilter(t, filter, query)),
        sortBy,
      ),
    [theses, filter, query, sortBy],
  );
  const filterCounts = useMemo(() => computeFilterCounts(theses, query), [theses, query]);
  const replaceThesis = useCallback((updated: ThesisDetail) => {
    setTheses((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setPreviewThesis((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);
  const resetFilters = useCallback(() => {
    setFilter("all");
    setQuery("");
  }, []);

  return {
    theses,
    setTheses,
    replaceThesis,
    filter,
    setFilter,
    filterCounts,
    resetFilters,
    sortBy,
    setSortBy,
    query,
    setQuery,
    viewMode,
    setViewMode,
    previewThesis,
    setPreviewThesis,
    visibleTheses,
  };
}

function useCardSelection(visibleTheses: readonly ThesisDetail[], onOpen: (id: string) => void) {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const count = visibleTheses.length;
  const moveSelection = useCallback(
    (delta: -1 | 1) => {
      if (count === 0) return;
      setSelectedIndex((prev) => {
        if (prev < 0 || prev >= count) return delta > 0 ? 0 : count - 1;
        return (prev + delta + count) % count;
      });
    },
    [count],
  );
  const active = selectedIndex >= 0 && selectedIndex < count ? visibleTheses[selectedIndex] : null;
  return {
    selectedIndex: active ? selectedIndex : -1,
    moveSelection,
    openSelected: active ? () => onOpen(active.id) : undefined,
  };
}

function useCockpitCommandGroups(params: {
  theses: readonly ThesisDetail[];
  glossary: readonly GlossaryTerm[];
  theme: "light" | "dark";
  setModal: (key: "cmd" | "create" | "ai", open: boolean) => void;
  toggleTheme: () => void;
  openThesis: (id: string) => void;
}) {
  const { theses, glossary, theme, setModal, toggleTheme, openThesis } = params;
  return useMemo(
    () =>
      buildCockpitCommandGroups({
        theses,
        glossary,
        theme,
        onOpenThesis: (item) => openThesis(item.id),
        onNewThesis: () => setModal("create", true),
        onOpenSettings: () => setModal("ai", true),
        onToggleTheme: toggleTheme,
      }),
    [theses, glossary, openThesis, setModal, theme, toggleTheme],
  );
}

export function useCockpitState(initialTheses: ThesisDetail[], glossary: readonly GlossaryTerm[]) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const collection = useCockpitCollection(initialTheses);
  const [modals, setModals] = useState({ cmd: false, create: false, ai: false });
  const [hasByok, setHasByok] = useState(false);

  useEffect(() => {
    setHasByok(Boolean(readByokConfig()));
  }, []);

  const setModal = useCallback((key: "cmd" | "create" | "ai", open: boolean) => {
    setModals((prev) => ({ ...prev, [key]: open }));
  }, []);
  const selection = useCardSelection(collection.visibleTheses, (id) =>
    router.push(`/thesis/${id}`),
  );
  useCockpitShortcuts({
    disabled: modals.cmd || modals.create || modals.ai || collection.previewThesis !== null,
    onNewThesis: () => setModal("create", true),
    onToggleView: () => collection.setViewMode((v) => (v === "cards" ? "table" : "cards")),
    onToggleTheme: toggleTheme,
    onFocusSearch: () => searchInputRef.current?.focus(),
    onMoveSelection: selection.moveSelection,
    onOpenSelected: selection.openSelected,
  });
  const commandGroups = useCockpitCommandGroups({
    theses: collection.theses,
    glossary,
    theme,
    setModal,
    toggleTheme,
    openThesis: (id) => router.push(`/thesis/${id}`),
  });
  return {
    router,
    searchInputRef,
    modals,
    setModal,
    hasByok,
    setHasByok,
    selectedIndex: selection.selectedIndex,
    commandGroups,
    ...collection,
  };
}
