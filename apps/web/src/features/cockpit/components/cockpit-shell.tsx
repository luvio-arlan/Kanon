"use client";

import { calculateAverageRiskReward, type GlossaryTerm, type ThesisDetail } from "@kanon/core";
import { CommandMenu, KANON_STAGGER_CONTAINER, useTheme } from "@kanon/ui";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AiSettingsModal, readByokConfig } from "@/features/ai-settings";
import { buildCockpitCommandGroups } from "../data/command-actions";
import { type CockpitFilter, CockpitHeader, type CockpitViewMode } from "./cockpit-header";
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

function matchesFilter(thesis: ThesisDetail, filter: CockpitFilter): boolean {
  if (filter === "archived") return thesis.status === "archived_veto";
  if (thesis.status === "archived_veto") return false;
  if (filter === "attractive") return thesis.valuation.convictionZone === "attractive";
  if (filter === "attention") return thesis.hypotheses.some((h) => h.status !== "validated");
  return true;
}

function computeStats(theses: readonly ThesisDetail[]) {
  const active = theses.filter((t) => t.status === "active");
  const validatedCount = active.reduce(
    (sum, item) => sum + item.hypotheses.filter((h) => h.status === "validated").length,
    0,
  );
  const averageRiskReward = calculateAverageRiskReward(
    active.map((item) => item.valuation.riskRewardRatio),
  );
  return {
    activeCount: active.length,
    archivedCount: theses.length - active.length,
    validatedCount,
    averageRiskReward,
  };
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
        <p className="text-sm text-ink-secondary">当前筛选条件下暂无标的，按 ⌘K 随时新建。</p>
      </div>
    );
  }
  if (viewMode === "table") {
    return <PortfolioComparisonTable theses={theses} />;
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

function CockpitOverlays(props: {
  commandOpen: boolean;
  newModalOpen: boolean;
  aiModalOpen: boolean;
  previewThesis: ThesisDetail | null;
  commandGroups: ReturnType<typeof buildCockpitCommandGroups>;
  onCommandOpen: (open: boolean) => void;
  onNewModalOpen: (open: boolean) => void;
  onAiModalOpen: (open: boolean) => void;
  onAiChanged: () => void;
  onClosePreview: () => void;
  onCreated: (created: ThesisDetail) => void;
}) {
  return (
    <>
      <CommandMenu
        open={props.commandOpen}
        onOpenChange={props.onCommandOpen}
        groups={props.commandGroups}
      />
      <ThesisPreviewSheet thesis={props.previewThesis} onClose={props.onClosePreview} />
      <NewThesisModal
        open={props.newModalOpen}
        onOpenChange={props.onNewModalOpen}
        onCreated={props.onCreated}
      />
      <AiSettingsModal
        open={props.aiModalOpen}
        onOpenChange={props.onAiModalOpen}
        onChanged={props.onAiChanged}
      />
    </>
  );
}

function useCockpitUiState(initialTheses: ThesisDetail[], glossary: readonly GlossaryTerm[]) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [theses, setTheses] = useState<ThesisDetail[]>(initialTheses);
  const [modals, setModals] = useState({ cmd: false, create: false, ai: false });
  const [hasByok, setHasByok] = useState(false);
  const [filter, setFilter] = useState<CockpitFilter>("all");
  const [viewMode, setViewMode] = useState<CockpitViewMode>("cards");
  const [previewThesis, setPreviewThesis] = useState<ThesisDetail | null>(null);

  useEffect(() => {
    setHasByok(Boolean(readByokConfig()));
  }, []);

  const setModal = (key: "cmd" | "create" | "ai", open: boolean) =>
    setModals((prev) => ({ ...prev, [key]: open }));
  const visibleTheses = useMemo(
    () => theses.filter((t) => matchesFilter(t, filter)),
    [theses, filter],
  );
  const commandGroups = buildCockpitCommandGroups({
    theses,
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
    theses,
    setTheses,
    modals,
    setModal,
    hasByok,
    setHasByok,
    filter,
    setFilter,
    viewMode,
    setViewMode,
    previewThesis,
    setPreviewThesis,
    visibleTheses,
    commandGroups,
  };
}

export function CockpitShell({ initialTheses, glossary }: CockpitShellProps) {
  const ui = useCockpitUiState(initialTheses, glossary);
  const stats = computeStats(ui.theses);

  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <CockpitTopbar
        hasByok={ui.hasByok}
        onOpenCommand={() => ui.setModal("cmd", true)}
        onOpenAiSettings={() => ui.setModal("ai", true)}
        onNewThesis={() => ui.setModal("create", true)}
      />
      <main className="mx-auto max-w-6xl px-6 pb-14 sm:px-10">
        <CockpitHeader
          totalCount={stats.activeCount}
          archivedCount={stats.archivedCount}
          validatedCount={stats.validatedCount}
          totalHypotheses={stats.activeCount * 3}
          averageRiskReward={stats.averageRiskReward}
          filter={ui.filter}
          viewMode={ui.viewMode}
          onFilterChange={ui.setFilter}
          onViewModeChange={ui.setViewMode}
        />
        <ThesisCollectionView
          theses={ui.visibleTheses}
          viewMode={ui.viewMode}
          onQuickInspect={ui.setPreviewThesis}
        />
        <DisciplineFooterStrip onOpenCommand={() => ui.setModal("cmd", true)} />
      </main>
      <CockpitOverlays
        commandOpen={ui.modals.cmd}
        newModalOpen={ui.modals.create}
        aiModalOpen={ui.modals.ai}
        previewThesis={ui.previewThesis}
        commandGroups={ui.commandGroups}
        onCommandOpen={(open) => ui.setModal("cmd", open)}
        onNewModalOpen={(open) => ui.setModal("create", open)}
        onAiModalOpen={(open) => ui.setModal("ai", open)}
        onAiChanged={() => ui.setHasByok(Boolean(readByokConfig()))}
        onClosePreview={() => ui.setPreviewThesis(null)}
        onCreated={(created) => {
          ui.setTheses((prev) => [...prev, created]);
          ui.router.push(`/thesis/${created.id}`);
        }}
      />
    </div>
  );
}
