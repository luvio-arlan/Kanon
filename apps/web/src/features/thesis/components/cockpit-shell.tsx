"use client";

import { calculateAverageRiskReward, type GlossaryTerm, type ThesisDetail } from "@kanon/core";
import { CommandMenu, KANON_STAGGER_CONTAINER, useTheme } from "@kanon/ui";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { buildCockpitCommandGroups } from "../data/command-actions";
import { type CockpitFilter, CockpitHeader } from "./cockpit-header";
import { CockpitTopbar } from "./cockpit-topbar";
import { DisciplineFooterStrip } from "./discipline-footer-strip";
import { NewThesisModal } from "./new-thesis-modal";
import { ThesisBentoCard } from "./thesis-bento-card";
import { ThesisPreviewSheet } from "./thesis-preview-sheet";

export interface CockpitShellProps {
  initialTheses: ThesisDetail[];
  glossary: readonly GlossaryTerm[];
}

function matchesFilter(thesis: ThesisDetail, filter: CockpitFilter): boolean {
  if (filter === "attractive" && thesis.valuation.convictionZone !== "attractive") return false;
  if (filter === "attention" && !thesis.hypotheses.some((h) => h.status !== "validated")) {
    return false;
  }
  return true;
}

function computeStats(theses: readonly ThesisDetail[]) {
  const validatedCount = theses.reduce(
    (sum, item) => sum + item.hypotheses.filter((h) => h.status === "validated").length,
    0,
  );
  const averageRiskReward = calculateAverageRiskReward(
    theses.map((item) => item.valuation.riskRewardRatio),
  );
  return { validatedCount, averageRiskReward };
}

function ThesisGridSection({
  theses,
  onQuickInspect,
}: {
  theses: readonly ThesisDetail[];
  onQuickInspect: (thesis: ThesisDetail) => void;
}) {
  if (theses.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-14 text-center shadow-card">
        <p className="text-sm text-ink-secondary">当前筛选条件下暂无标的，按 ⌘K 随时新建。</p>
      </div>
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

function CockpitOverlays(props: {
  commandOpen: boolean;
  newModalOpen: boolean;
  previewThesis: ThesisDetail | null;
  commandGroups: ReturnType<typeof buildCockpitCommandGroups>;
  onCommandOpen: (open: boolean) => void;
  onNewModalOpen: (open: boolean) => void;
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
    </>
  );
}

function useCockpitController(initialTheses: ThesisDetail[], glossary: readonly GlossaryTerm[]) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [theses, setTheses] = useState<ThesisDetail[]>(initialTheses);
  const [commandOpen, setCommandOpen] = useState(false);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [filter, setFilter] = useState<CockpitFilter>("all");
  const [previewThesis, setPreviewThesis] = useState<ThesisDetail | null>(null);

  const visibleTheses = useMemo(
    () => theses.filter((item) => matchesFilter(item, filter)),
    [theses, filter],
  );
  const commandGroups = buildCockpitCommandGroups({
    theses,
    glossary,
    theme,
    onOpenThesis: (item) => router.push(`/thesis/${item.id}`),
    onNewThesis: () => setNewModalOpen(true),
    onExportCsv: () => {
      window.location.href = "/api/export/portfolio";
    },
    onToggleTheme: toggleTheme,
  });

  function handleCreated(created: ThesisDetail) {
    setTheses((prev) => [...prev, created]);
    router.push(`/thesis/${created.id}`);
  }

  return {
    theses,
    visibleTheses,
    stats: computeStats(theses),
    filter,
    setFilter,
    commandOpen,
    setCommandOpen,
    newModalOpen,
    setNewModalOpen,
    previewThesis,
    setPreviewThesis,
    commandGroups,
    handleCreated,
  };
}

export function CockpitShell({ initialTheses, glossary }: CockpitShellProps) {
  const ctrl = useCockpitController(initialTheses, glossary);
  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <CockpitTopbar
        onOpenCommand={() => ctrl.setCommandOpen(true)}
        onNewThesis={() => ctrl.setNewModalOpen(true)}
      />
      <main className="mx-auto max-w-6xl px-6 pb-14 sm:px-10">
        <CockpitHeader
          totalCount={ctrl.theses.length}
          validatedCount={ctrl.stats.validatedCount}
          totalHypotheses={ctrl.theses.length * 3}
          averageRiskReward={ctrl.stats.averageRiskReward}
          filter={ctrl.filter}
          onFilterChange={ctrl.setFilter}
        />
        <ThesisGridSection theses={ctrl.visibleTheses} onQuickInspect={ctrl.setPreviewThesis} />
        <DisciplineFooterStrip onOpenCommand={() => ctrl.setCommandOpen(true)} />
      </main>
      <CockpitOverlays
        commandOpen={ctrl.commandOpen}
        newModalOpen={ctrl.newModalOpen}
        previewThesis={ctrl.previewThesis}
        commandGroups={ctrl.commandGroups}
        onCommandOpen={ctrl.setCommandOpen}
        onNewModalOpen={ctrl.setNewModalOpen}
        onClosePreview={() => ctrl.setPreviewThesis(null)}
        onCreated={ctrl.handleCreated}
      />
    </div>
  );
}
