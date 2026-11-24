"use client";

import { calculatePortfolioAnalytics, type GlossaryTerm, type ThesisDetail } from "@kanon/core";
import { CommandMenu, KANON_STAGGER_CONTAINER } from "@kanon/ui";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { AiSettingsModal, readByokConfig } from "@/features/ai-settings";
import { AttentionRadarStrip, CompareThesesSheet, ImportArchiveModal } from "@/features/portfolio";
import { apiRefreshClosingPrices } from "../lib/cockpit-api";
import { useCockpitState } from "../lib/cockpit-state";
import { CockpitHeader, type CockpitViewMode } from "./cockpit-header";
import { CockpitTopbar } from "./cockpit-topbar";
import { DisciplineFooterStrip } from "./discipline-footer-strip";
import { NewThesisModal } from "./new-thesis-modal";
import { PortfolioComparisonTable } from "./portfolio-comparison-table";
import { ThesisBentoCard } from "./thesis-bento-card";
import { ThesisPreviewSheet } from "./thesis-preview-sheet";

export interface CockpitShellProps {
  initialTheses: ThesisDetail[];
  glossary: readonly GlossaryTerm[];
}

function ThesisCollectionView({
  theses,
  viewMode,
  compareIds,
  onToggleCompare,
  onOpenCompare,
  onQuickInspect,
}: {
  theses: readonly ThesisDetail[];
  viewMode: CockpitViewMode;
  compareIds: readonly string[];
  onToggleCompare: (id: string) => void;
  onOpenCompare: () => void;
  onQuickInspect: (thesis: ThesisDetail) => void;
}) {
  if (theses.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-14 text-center shadow-card">
        <p className="text-sm text-ink-secondary">当前筛选条件下暂无标的，按 N 或 ⌘K 随时新建。</p>
      </div>
    );
  }
  if (viewMode === "table") {
    return (
      <PortfolioComparisonTable
        theses={theses}
        selectedIds={compareIds}
        onToggleCompare={onToggleCompare}
        onOpenCompare={onOpenCompare}
        onQuickInspect={onQuickInspect}
      />
    );
  }
  return (
    <motion.section
      variants={KANON_STAGGER_CONTAINER}
      initial="hidden"
      animate="visible"
      aria-label="跟踪标的列表"
      className="grid grid-cols-1 items-start gap-7 lg:grid-cols-2"
    >
      {theses.map((thesis) => (
        <ThesisBentoCard key={thesis.id} thesis={thesis} onQuickInspect={onQuickInspect} />
      ))}
    </motion.section>
  );
}

function usePortfolioOverlayState(ui: ReturnType<typeof useCockpitState>) {
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const compareTheses = useMemo(
    () => ui.theses.filter((t) => compareIds.includes(t.id)),
    [ui.theses, compareIds],
  );
  const toggleCompare = (id: string) =>
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev,
    );
  const refreshPrices = async () => {
    setRefreshingPrices(true);
    try {
      const updated = await apiRefreshClosingPrices();
      if (updated) ui.setTheses(updated);
    } finally {
      setRefreshingPrices(false);
    }
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
    clearCompare: () => {
      setCompareIds([]);
      setCompareOpen(false);
    },
    importOpen,
    setImportOpen,
    refreshPrices,
    onCreated,
    onImported,
  };
}

function CockpitOverlays({
  ui,
  ext,
}: {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
}) {
  return (
    <>
      <CommandMenu
        open={ui.modals.cmd}
        onOpenChange={(o) => ui.setModal("cmd", o)}
        groups={ui.commandGroups}
      />
      <ThesisPreviewSheet
        thesis={ui.previewThesis}
        onClose={() => ui.setPreviewThesis(null)}
        onUpdated={ui.replaceThesis}
      />
      <NewThesisModal
        open={ui.modals.create}
        onOpenChange={(o) => ui.setModal("create", o)}
        onCreated={ext.onCreated}
      />
      <AiSettingsModal
        open={ui.modals.ai}
        onOpenChange={(o) => ui.setModal("ai", o)}
        onChanged={() => ui.setHasByok(Boolean(readByokConfig()))}
      />
      <CompareThesesSheet
        open={ext.compareOpen}
        theses={ext.compareTheses}
        onOpenChange={ext.setCompareOpen}
        onClearSelection={ext.clearCompare}
      />
      <ImportArchiveModal
        open={ext.importOpen}
        onOpenChange={ext.setImportOpen}
        onImported={ext.onImported}
      />
    </>
  );
}

function CockpitMainBody({
  ui,
  ext,
  analytics,
}: {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
  analytics: ReturnType<typeof calculatePortfolioAnalytics>;
}) {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-14 sm:px-10">
      <CockpitHeader
        analytics={analytics}
        filter={ui.filter}
        viewMode={ui.viewMode}
        sortBy={ui.sortBy}
        query={ui.query}
        searchInputRef={ui.searchInputRef}
        onFilterChange={ui.setFilter}
        onViewModeChange={ui.setViewMode}
        onSortChange={ui.setSortBy}
        onQueryChange={ui.setQuery}
      />
      <div className="-mt-4 mb-6">
        <AttentionRadarStrip
          analytics={analytics}
          onFocusBuyZone={() => {
            ui.setFilter("attractive");
            ui.setSortBy("margin");
          }}
          onFocusWarnings={() => ui.setFilter("attention")}
        />
      </div>
      <ThesisCollectionView
        theses={ui.visibleTheses}
        viewMode={ui.viewMode}
        compareIds={ext.compareIds}
        onToggleCompare={ext.toggleCompare}
        onOpenCompare={() => ext.setCompareOpen(true)}
        onQuickInspect={ui.setPreviewThesis}
      />
      <DisciplineFooterStrip onOpenCommand={() => ui.setModal("cmd", true)} />
    </main>
  );
}

export function CockpitShell({ initialTheses, glossary }: CockpitShellProps) {
  const ui = useCockpitState(initialTheses, glossary);
  const ext = usePortfolioOverlayState(ui);
  const analytics = useMemo(() => calculatePortfolioAnalytics(ui.theses), [ui.theses]);

  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <CockpitTopbar
        hasByok={ui.hasByok}
        refreshingPrices={ext.refreshingPrices}
        onRefreshPrices={() => void ext.refreshPrices()}
        onOpenImport={() => ext.setImportOpen(true)}
        onOpenCommand={() => ui.setModal("cmd", true)}
        onOpenAiSettings={() => ui.setModal("ai", true)}
        onNewThesis={() => ui.setModal("create", true)}
      />
      <CockpitMainBody ui={ui} ext={ext} analytics={analytics} />
      <CockpitOverlays ui={ui} ext={ext} />
    </div>
  );
}
