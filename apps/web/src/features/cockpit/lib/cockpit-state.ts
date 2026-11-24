"use client";

import { calculateImpliedExpectations, type GlossaryTerm, type ThesisDetail } from "@kanon/core";
import { useTheme } from "@kanon/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { readByokConfig } from "@/features/ai-settings";
import type { CockpitFilter, CockpitSortBy, CockpitViewMode } from "../components/cockpit-header";
import { buildCockpitCommandGroups } from "../data/command-actions";
import { useCockpitShortcuts } from "./use-cockpit-shortcuts";

function matchesFilter(thesis: ThesisDetail, filter: CockpitFilter, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (
    q &&
    !`${thesis.ticker} ${thesis.companyName} ${thesis.sectorTag}`.toLowerCase().includes(q)
  ) {
    return false;
  }
  if (filter === "archived") return thesis.status === "archived_veto";
  if (thesis.status === "archived_veto") return false;
  if (filter === "attractive") return thesis.valuation.convictionZone === "attractive";
  if (filter === "attention") return thesis.hypotheses.some((h) => h.status !== "validated");
  return true;
}

function sortTheses(items: readonly ThesisDetail[], sortBy: CockpitSortBy): ThesisDetail[] {
  const copy = [...items];
  if (sortBy === "odds") {
    return copy.sort(
      (a, b) => (b.valuation.riskRewardRatio ?? 99) - (a.valuation.riskRewardRatio ?? 99),
    );
  }
  if (sortBy === "cagr")
    return copy.sort((a, b) => b.valuation.base.cagrPct - a.valuation.base.cagrPct);
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
  const replaceThesis = (updated: ThesisDetail) => {
    setTheses((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setPreviewThesis((prev) => (prev?.id === updated.id ? updated : prev));
  };

  return {
    theses,
    setTheses,
    replaceThesis,
    filter,
    setFilter,
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

  const setModal = (key: "cmd" | "create" | "ai", open: boolean) =>
    setModals((prev) => ({ ...prev, [key]: open }));

  useCockpitShortcuts({
    disabled: modals.cmd || modals.create || modals.ai || collection.previewThesis !== null,
    onNewThesis: () => setModal("create", true),
    onToggleView: () => collection.setViewMode((v) => (v === "cards" ? "table" : "cards")),
    onToggleTheme: toggleTheme,
    onFocusSearch: () => searchInputRef.current?.focus(),
  });

  const commandGroups = buildCockpitCommandGroups({
    theses: collection.theses,
    glossary,
    theme,
    onOpenThesis: (item) => router.push(`/thesis/${item.id}`),
    onNewThesis: () => setModal("create", true),
    onOpenAiSettings: () => setModal("ai", true),
    onExportCsv: () => window.location.assign("/api/export/portfolio"),
    onToggleTheme: toggleTheme,
  });

  return {
    router,
    searchInputRef,
    modals,
    setModal,
    hasByok,
    setHasByok,
    commandGroups,
    ...collection,
  };
}
