"use client";

import type { calculatePortfolioAnalytics } from "@kanon/core";
import { cn, KANON_FADE_UP_ITEM, KANON_STAGGER_CONTAINER, KANON_TRANSITION_FAST } from "@kanon/ui";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import type { useCockpitState } from "../../lib/cockpit-state";
import type { LiveMarketQuotesState } from "../../lib/use-live-market-quotes";
import type { usePortfolioOverlayState } from "../../lib/use-portfolio-overlays";
import { CockpitEmptyState } from "../cockpit-empty-state";
import { ThesisBentoCard } from "../thesis-bento-card";

const ViewSkeleton = () => (
  <div
    aria-hidden="true"
    className="kanon-shimmer h-72 w-full rounded-card border border-hairline"
  />
);
const CatalystCalendarBoard = dynamic(
  () => import("@/features/portfolio/public-sheets").then((m) => m.CatalystCalendarBoard),
  { ssr: false, loading: ViewSkeleton },
);
const PeerExpectationsMatrix = dynamic(
  () => import("@/features/portfolio/public-sheets").then((m) => m.PeerExpectationsMatrix),
  { ssr: false, loading: ViewSkeleton },
);
const PortfolioComparisonTable = dynamic(
  () => import("../portfolio-comparison-table").then((m) => m.PortfolioComparisonTable),
  { ssr: false, loading: ViewSkeleton },
);

export interface CockpitStageProps {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
  market: LiveMarketQuotesState;
  analytics: ReturnType<typeof calculatePortfolioAnalytics>;
  onOpenMarketSettings: () => void;
}

function ThesisCardsGrid({ ui, market }: Pick<CockpitStageProps, "ui" | "market">) {
  return (
    <motion.section
      aria-label="跟踪标的列表"
      variants={KANON_STAGGER_CONTAINER}
      initial={false}
      animate="visible"
      className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-2 2xl:grid-cols-3"
    >
      {ui.visibleTheses.map((thesis, idx) => (
        <motion.div
          key={thesis.id}
          variants={KANON_FADE_UP_ITEM}
          className={cn(
            "flex h-full rounded-card transition-shadow",
            idx === ui.selectedIndex && "ring-1 ring-accent-coral/70",
          )}
        >
          <ThesisBentoCard
            thesis={thesis}
            liveQuote={market.quotes[thesis.ticker]}
            onQuickInspect={ui.setPreviewThesis}
          />
        </motion.div>
      ))}
    </motion.section>
  );
}

function renderCollectionBody({ ui, ext, market, analytics }: CockpitStageProps) {
  const searched = ui.query.trim() ? ui.visibleTheses : ui.theses;
  if (ui.viewMode === "catalysts") return <CatalystCalendarBoard theses={searched} />;
  if (ui.viewMode === "comps") {
    return <PeerExpectationsMatrix theses={searched} liveQuotes={market.quotes} />;
  }
  if (ui.visibleTheses.length === 0) {
    return (
      <CockpitEmptyState
        filter={ui.filter}
        query={ui.query}
        totalActiveCount={analytics.activeCount}
        onResetFilters={ui.resetFilters}
        onNewThesis={() => ui.setModal("create", true)}
        onCreated={ext.onCreated}
      />
    );
  }
  if (ui.viewMode === "table") {
    return (
      <PortfolioComparisonTable
        theses={ui.visibleTheses}
        selectedIds={ext.compareIds}
        onToggleCompare={ext.toggleCompare}
        onOpenCompare={() => ext.setCompareOpen(true)}
        onQuickInspect={ui.setPreviewThesis}
      />
    );
  }
  return <ThesisCardsGrid ui={ui} market={market} />;
}

export function ThesisCollectionView(p: CockpitStageProps) {
  const emptyTag = p.ui.visibleTheses.length === 0 ? "empty" : "list";
  const key =
    p.ui.viewMode === "table" ? `table:${emptyTag}` : `${p.ui.viewMode}:${p.ui.filter}:${emptyTag}`;
  return (
    <div className="min-h-[340px]">
      <motion.div
        key={key}
        initial={{ opacity: 0.78 }}
        animate={{ opacity: 1 }}
        transition={KANON_TRANSITION_FAST}
      >
        {renderCollectionBody(p)}
      </motion.div>
    </div>
  );
}
