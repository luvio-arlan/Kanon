"use client";

import {
  calculatePortfolioAnalytics,
  type GlossaryTerm,
  type PublicUser,
  type ThesisDetail,
} from "@kanon/core";
import { CommandMenu, KANON_TRANSITION_FAST } from "@kanon/ui";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { AiSettingsModal, readByokConfig } from "@/features/ai-settings";
import { CompareThesesSheet, ImportArchiveModal, PortfolioStressSheet } from "@/features/portfolio";
import { useCockpitState } from "../lib/cockpit-state";
import { shouldShowGuideByDefault, writeGuideDismissedCookie } from "../lib/guide-cookie";
import { usePortfolioOverlayState } from "../lib/use-portfolio-overlays";
import { CockpitEmptyState } from "./cockpit-empty-state";
import { type CockpitFilter, CockpitHeader, type CockpitViewMode } from "./cockpit-header";
import { CockpitTopbar } from "./cockpit-topbar";
import { NewThesisModal } from "./new-thesis-modal";
import { OnboardingGuideCard } from "./onboarding-guide-card";
import { PortfolioComparisonTable } from "./portfolio-comparison-table";
import { ThesisBentoCard } from "./thesis-bento-card";
import { ThesisPreviewSheet } from "./thesis-preview-sheet";

export interface CockpitShellProps {
  initialTheses: ThesisDetail[];
  glossary: readonly GlossaryTerm[];
  currentUser: PublicUser;
  initialGuideDismissed?: boolean;
}

function CardsGrid({
  theses,
  onQuickInspect,
}: {
  theses: readonly ThesisDetail[];
  onQuickInspect: (thesis: ThesisDetail) => void;
}) {
  return (
    <section
      aria-label="跟踪标的列表"
      className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2"
    >
      {theses.map((thesis) => (
        <ThesisBentoCard key={thesis.id} thesis={thesis} onQuickInspect={onQuickInspect} />
      ))}
    </section>
  );
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
      <CardsGrid theses={p.theses} onQuickInspect={p.onQuickInspect} />
    );

  return (
    <div className="min-h-[360px]">
      <motion.div
        key={stateKey}
        initial={{ opacity: 0.72 }}
        animate={{ opacity: 1 }}
        transition={KANON_TRANSITION_FAST}
      >
        {body}
      </motion.div>
    </div>
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
      <PortfolioStressSheet
        open={ext.stressOpen}
        theses={ui.theses}
        onOpenChange={ext.setStressOpen}
        onInspectThesis={ui.setPreviewThesis}
      />
    </>
  );
}

interface MainBodyProps {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
  analytics: ReturnType<typeof calculatePortfolioAnalytics>;
  guideOpen: boolean;
  onDismissGuide: () => void;
}

function CockpitMainBody({ ui, ext, analytics, guideOpen, onDismissGuide }: MainBodyProps) {
  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 sm:px-10">
      <CockpitHeader
        analytics={analytics}
        filter={ui.filter}
        filterCounts={ui.filterCounts}
        viewMode={ui.viewMode}
        sortBy={ui.sortBy}
        query={ui.query}
        searchInputRef={ui.searchInputRef}
        onFilterChange={ui.setFilter}
        onViewModeChange={ui.setViewMode}
        onSortChange={ui.setSortBy}
        onQueryChange={ui.setQuery}
        onFocusBuyZone={() => {
          ui.setFilter("attractive");
          ui.setSortBy("margin");
        }}
        onFocusWarnings={() => ui.setFilter("attention")}
        onOpenStressTest={() => ext.setStressOpen(true)}
      />
      <OnboardingGuideCard
        open={guideOpen}
        theses={ui.theses}
        onDismiss={onDismissGuide}
        onNewThesis={() => ui.setModal("create", true)}
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
      />
    </main>
  );
}

export function CockpitShell({
  initialTheses,
  glossary,
  currentUser,
  initialGuideDismissed = false,
}: CockpitShellProps) {
  const ui = useCockpitState(initialTheses, glossary);
  const ext = usePortfolioOverlayState(ui);
  const analytics = useMemo(() => calculatePortfolioAnalytics(ui.theses), [ui.theses]);
  const [guideOpen, setGuideOpen] = useState(() =>
    shouldShowGuideByDefault(initialTheses, initialGuideDismissed),
  );
  const toggleGuide = (next: boolean) => {
    setGuideOpen(next);
    writeGuideDismissedCookie(!next);
  };

  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <CockpitTopbar
        currentUser={currentUser}
        hasByok={ui.hasByok}
        refreshingPrices={ext.refreshingPrices}
        guideOpen={guideOpen}
        onRefreshPrices={() => void ext.refreshPrices()}
        onOpenImport={() => ext.setImportOpen(true)}
        onOpenStressTest={() => ext.setStressOpen(true)}
        onToggleGuide={() => toggleGuide(!guideOpen)}
        onOpenCommand={() => ui.setModal("cmd", true)}
        onOpenAiSettings={() => ui.setModal("ai", true)}
        onNewThesis={() => ui.setModal("create", true)}
      />
      <CockpitMainBody
        ui={ui}
        ext={ext}
        analytics={analytics}
        guideOpen={guideOpen}
        onDismissGuide={() => toggleGuide(false)}
      />
      <CockpitOverlays ui={ui} ext={ext} />
    </div>
  );
}
