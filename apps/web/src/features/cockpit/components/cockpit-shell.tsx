"use client";

import { calculatePortfolioAnalytics, type GlossaryTerm, type ThesisDetail } from "@kanon/core";
import { CommandMenu, KANON_STAGGER_CONTAINER } from "@kanon/ui";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { AiSettingsModal, readByokConfig } from "@/features/ai-settings";
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
  onQuickInspect,
}: {
  theses: readonly ThesisDetail[];
  viewMode: CockpitViewMode;
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
    return <PortfolioComparisonTable theses={theses} onQuickInspect={onQuickInspect} />;
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

function CockpitOverlays({ ui }: { ui: ReturnType<typeof useCockpitState> }) {
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
        onCreated={(created) => {
          ui.setTheses((prev) => [...prev, created]);
          ui.router.push(`/thesis/${created.id}`);
        }}
      />
      <AiSettingsModal
        open={ui.modals.ai}
        onOpenChange={(o) => ui.setModal("ai", o)}
        onChanged={() => ui.setHasByok(Boolean(readByokConfig()))}
      />
    </>
  );
}

export function CockpitShell({ initialTheses, glossary }: CockpitShellProps) {
  const ui = useCockpitState(initialTheses, glossary);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const analytics = useMemo(() => calculatePortfolioAnalytics(ui.theses), [ui.theses]);

  async function handleRefreshPrices() {
    setRefreshingPrices(true);
    try {
      const updated = await apiRefreshClosingPrices();
      if (updated) ui.setTheses(updated);
    } finally {
      setRefreshingPrices(false);
    }
  }

  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <CockpitTopbar
        hasByok={ui.hasByok}
        refreshingPrices={refreshingPrices}
        onRefreshPrices={() => void handleRefreshPrices()}
        onOpenCommand={() => ui.setModal("cmd", true)}
        onOpenAiSettings={() => ui.setModal("ai", true)}
        onNewThesis={() => ui.setModal("create", true)}
      />
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
        <ThesisCollectionView
          theses={ui.visibleTheses}
          viewMode={ui.viewMode}
          onQuickInspect={ui.setPreviewThesis}
        />
        <DisciplineFooterStrip onOpenCommand={() => ui.setModal("cmd", true)} />
      </main>
      <CockpitOverlays ui={ui} />
    </div>
  );
}
