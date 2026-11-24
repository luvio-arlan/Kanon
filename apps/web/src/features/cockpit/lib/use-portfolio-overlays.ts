"use client";

import type { MarketQuoteSnapshot, ThesisDetail } from "@kanon/core";
import { useMemo, useState } from "react";
import { apiRefreshClosingPrices } from "./cockpit-api";
import type { useCockpitState } from "./cockpit-state";

function toggleCompareList(prev: string[], id: string): string[] {
  if (prev.includes(id)) return prev.filter((x) => x !== id);
  return prev.length < 3 ? [...prev, id] : prev;
}

function usePriceRefreshAction(
  setTheses: ReturnType<typeof useCockpitState>["setTheses"],
  onMergeQuotes?: (next: Record<string, MarketQuoteSnapshot>) => void,
) {
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const refreshPrices = async () => {
    setRefreshingPrices(true);
    try {
      const result = await apiRefreshClosingPrices("extended");
      if (result) {
        setTheses(result.theses);
        if (result.quotes) onMergeQuotes?.(result.quotes);
      }
    } finally {
      setRefreshingPrices(false);
    }
  };
  return { refreshingPrices, refreshPrices };
}

export function usePortfolioOverlayState(
  ui: ReturnType<typeof useCockpitState>,
  onMergeQuotes?: (next: Record<string, MarketQuoteSnapshot>) => void,
) {
  const { refreshingPrices, refreshPrices } = usePriceRefreshAction(ui.setTheses, onMergeQuotes);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [stressOpen, setStressOpen] = useState(false);
  const compareTheses = useMemo(
    () => ui.theses.filter((t) => compareIds.includes(t.id)),
    [ui.theses, compareIds],
  );
  const toggleCompare = (id: string) => setCompareIds((prev) => toggleCompareList(prev, id));
  const clearCompare = () => {
    setCompareIds([]);
    setCompareOpen(false);
  };
  const onCreated = (created: ThesisDetail) => {
    ui.setTheses((p) => [...p, created]);
    ui.router.push(`/thesis/${created.id}`);
  };
  const onImported = (imp: ThesisDetail, mode: "create_copy" | "overwrite") =>
    ui.setTheses((p) =>
      mode === "overwrite" ? p.map((t) => (t.id === imp.id ? imp : t)) : [...p, imp],
    );
  return {
    refreshingPrices,
    compareIds,
    compareOpen,
    setCompareOpen,
    compareTheses,
    toggleCompare,
    clearCompare,
    importOpen,
    setImportOpen,
    stressOpen,
    setStressOpen,
    refreshPrices,
    onCreated,
    onImported,
  };
}
