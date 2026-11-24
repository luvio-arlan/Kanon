"use client";

import {
  calculatePortfolioAnalytics,
  type GlossaryTerm,
  type PublicUser,
  type ThesisDetail,
} from "@kanon/core";
import { Button, CommandMenu, KANON_TRANSITION_FAST, WorkbenchShell } from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { AiSettingsModal, readByokConfig } from "@/features/ai-settings";
import { CompareThesesSheet, ImportArchiveModal, PortfolioStressSheet } from "@/features/portfolio";
import { useCockpitState } from "../lib/cockpit-state";
import { usePortfolioOverlayState } from "../lib/use-portfolio-overlays";
import { CockpitEmptyState } from "./cockpit-empty-state";
import { type CockpitFilter, CockpitHeader, type CockpitViewMode } from "./cockpit-header";
import { CockpitSidebar } from "./cockpit-sidebar";
import { NewThesisModal } from "./new-thesis-modal";
import { PortfolioComparisonTable } from "./portfolio-comparison-table";
import { ThesisBentoCard } from "./thesis-bento-card";
import { ThesisPreviewSheet } from "./thesis-preview-sheet";

export interface CockpitShellProps {
  initialTheses: ThesisDetail[];
  glossary: readonly GlossaryTerm[];
  currentUser: PublicUser;
}

interface CollectionViewProps {
  theses: readonly ThesisDetail[];
  filter: CockpitFilter;
  query: string;
  totalActiveCount: number;
  viewMode: CockpitViewMode;
  compareIds: readonly string[];
  onToggleCompare: (id: string) => void;
  onOpenCompare: () => void;
  onQuickInspect: (thesis: ThesisDetail) => void;
  onResetFilters: () => void;
  onNewThesis: () => void;
  onCreated: (thesis: ThesisDetail) => void;
}

function ThesisCollectionView(p: CollectionViewProps) {
  const stateKey = `${p.viewMode}:${p.filter}:${p.theses.length === 0 ? "empty" : "list"}`;
  const body =
    p.theses.length === 0 ? (
      <CockpitEmptyState
        filter={p.filter}
        query={p.query}
        totalActiveCount={p.totalActiveCount}
        onResetFilters={p.onResetFilters}
        onNewThesis={p.onNewThesis}
        onCreated={p.onCreated}
      />
    ) : p.viewMode === "table" ? (
      <PortfolioComparisonTable
        theses={p.theses}
        selectedIds={p.compareIds}
        onToggleCompare={p.onToggleCompare}
        onOpenCompare={p.onOpenCompare}
        onQuickInspect={p.onQuickInspect}
      />
    ) : (
      <section
        aria-label="跟踪标的列表"
        className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-2 2xl:grid-cols-3"
      >
        {p.theses.map((thesis) => (
          <ThesisBentoCard key={thesis.id} thesis={thesis} onQuickInspect={p.onQuickInspect} />
        ))}
      </section>
    );

  return (
    <div className="min-h-[340px]">
      <motion.div
        key={stateKey}
        initial={{ opacity: 0.78 }}
        animate={{ opacity: 1 }}
        transition={KANON_TRANSITION_FAST}
      >
        {body}
      </motion.div>
    </div>
  );
}

function PortfolioDialogs({
  ui,
  ext,
}: {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
}) {
  return (
    <>
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
      <PortfolioStressSheet
        open={ext.stressOpen}
        theses={ui.theses}
        onOpenChange={ext.setStressOpen}
        onInspectThesis={ui.setPreviewThesis}
      />
    </>
  );
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
        refreshingPrices={ext.refreshingPrices}
        onRefreshPrices={() => void ext.refreshPrices()}
        onOpenImport={() => ext.setImportOpen(true)}
      />
      <PortfolioDialogs ui={ui} ext={ext} />
    </>
  );
}

function CockpitMainStage({
  ui,
  ext,
  analytics,
}: {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
  analytics: ReturnType<typeof calculatePortfolioAnalytics>;
}) {
  return (
    <div className="w-full space-y-5 px-5 pb-10 pt-5 sm:px-8 lg:px-9 lg:pt-5">
      <CockpitHeader
        analytics={analytics}
        theses={ui.theses}
        filter={ui.filter}
        viewMode={ui.viewMode}
        sortBy={ui.sortBy}
        query={ui.query}
        searchInputRef={ui.searchInputRef}
        onSortChange={ui.setSortBy}
        onQueryChange={ui.setQuery}
        onNewThesis={() => ui.setModal("create", true)}
        onFocusBuyZone={() => {
          ui.setViewMode("cards");
          ui.setFilter("attractive");
          ui.setSortBy("margin");
        }}
        onFocusWarnings={() => {
          ui.setViewMode("cards");
          ui.setFilter("attention");
        }}
        onOpenStressTest={() => ext.setStressOpen(true)}
      />
      <ThesisCollectionView
        theses={ui.visibleTheses}
        filter={ui.filter}
        query={ui.query}
        totalActiveCount={analytics.activeCount}
        viewMode={ui.viewMode}
        compareIds={ext.compareIds}
        onToggleCompare={ext.toggleCompare}
        onOpenCompare={() => ext.setCompareOpen(true)}
        onQuickInspect={ui.setPreviewThesis}
        onResetFilters={ui.resetFilters}
        onNewThesis={() => ui.setModal("create", true)}
        onCreated={ext.onCreated}
      />
    </div>
  );
}

export function CockpitShell({ initialTheses, glossary, currentUser }: CockpitShellProps) {
  const ui = useCockpitState(initialTheses, glossary);
  const ext = usePortfolioOverlayState(ui);
  const analytics = useMemo(() => calculatePortfolioAnalytics(ui.theses), [ui.theses]);

  return (
    <>
      <WorkbenchShell
        mobileActions={
          <Button variant="primary" size="sm" onClick={() => ui.setModal("create", true)}>
            <IconPlus size={15} stroke={1.5} />
            <span>新建</span>
          </Button>
        }
        sidebar={({ collapsed, onToggleCollapse, closeMobile }) => (
          <CockpitSidebar
            currentUser={currentUser}
            theses={ui.theses}
            filter={ui.filter}
            filterCounts={ui.filterCounts}
            viewMode={ui.viewMode}
            refreshingPrices={ext.refreshingPrices}
            collapsed={collapsed}
            onToggleCollapse={onToggleCollapse}
            onCloseMobile={closeMobile}
            onSelectFilter={ui.setFilter}
            onSelectViewMode={ui.setViewMode}
            onOpenCommand={() => ui.setModal("cmd", true)}
            onRefreshPrices={() => void ext.refreshPrices()}
            onOpenStressTest={() => ext.setStressOpen(true)}
            onOpenSettings={() => ui.setModal("ai", true)}
          />
        )}
      >
        <CockpitMainStage ui={ui} ext={ext} analytics={analytics} />
      </WorkbenchShell>
      <CockpitOverlays ui={ui} ext={ext} />
    </>
  );
}
