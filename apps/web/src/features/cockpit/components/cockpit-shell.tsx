"use client";

import {
  calculatePortfolioAnalytics,
  type GlossaryTerm,
  type MarketQuoteSnapshot,
  type PublicUser,
  type ThesisDetail,
} from "@kanon/core";
import {
  Button,
  KANON_FADE_UP_ITEM,
  KANON_STAGGER_CONTAINER,
  KANON_TRANSITION_FAST,
  WorkbenchShell,
} from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { CatalystCalendarBoard, PeerExpectationsMatrix } from "@/features/portfolio";
import { useCockpitState } from "../lib/cockpit-state";
import { type LiveMarketQuotesState, useLiveMarketQuotes } from "../lib/use-live-market-quotes";
import { usePortfolioOverlayState } from "../lib/use-portfolio-overlays";
import { CockpitEmptyState } from "./cockpit-empty-state";
import { type CockpitFilter, CockpitHeader, type CockpitViewMode } from "./cockpit-header";
import { CockpitSidebar } from "./cockpit-sidebar";
import { CockpitOverlays } from "./overlays/cockpit-overlays";
import { PortfolioComparisonTable } from "./portfolio-comparison-table";
import { ThesisBentoCard } from "./thesis-bento-card";

export interface CockpitShellProps {
  initialTheses: ThesisDetail[];
  glossary: readonly GlossaryTerm[];
  currentUser: PublicUser;
}

interface CollectionViewProps {
  theses: readonly ThesisDetail[];
  allTheses: readonly ThesisDetail[];
  liveQuotes: Readonly<Record<string, MarketQuoteSnapshot>>;
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

function renderCollectionBody(p: CollectionViewProps) {
  if (p.viewMode === "catalysts") return <CatalystCalendarBoard theses={p.allTheses} />;
  if (p.viewMode === "comps") {
    return <PeerExpectationsMatrix theses={p.allTheses} liveQuotes={p.liveQuotes} />;
  }
  if (p.theses.length === 0) {
    return (
      <CockpitEmptyState
        filter={p.filter}
        query={p.query}
        totalActiveCount={p.totalActiveCount}
        onResetFilters={p.onResetFilters}
        onNewThesis={p.onNewThesis}
        onCreated={p.onCreated}
      />
    );
  }
  if (p.viewMode === "table") {
    return (
      <PortfolioComparisonTable
        theses={p.theses}
        selectedIds={p.compareIds}
        onToggleCompare={p.onToggleCompare}
        onOpenCompare={p.onOpenCompare}
        onQuickInspect={p.onQuickInspect}
      />
    );
  }
  return (
    <motion.section
      aria-label="跟踪标的列表"
      variants={KANON_STAGGER_CONTAINER}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-2 2xl:grid-cols-3"
    >
      {p.theses.map((thesis) => (
        <motion.div key={thesis.id} variants={KANON_FADE_UP_ITEM} className="flex h-full">
          <ThesisBentoCard
            thesis={thesis}
            liveQuote={p.liveQuotes[thesis.ticker]}
            onQuickInspect={p.onQuickInspect}
          />
        </motion.div>
      ))}
    </motion.section>
  );
}

function ThesisCollectionView(p: CollectionViewProps) {
  const stateKey = `${p.viewMode}:${p.filter}:${p.theses.length === 0 ? "empty" : "list"}`;
  return (
    <div className="min-h-[340px]">
      <motion.div
        key={stateKey}
        initial={{ opacity: 0.78 }}
        animate={{ opacity: 1 }}
        transition={KANON_TRANSITION_FAST}
      >
        {renderCollectionBody(p)}
      </motion.div>
    </div>
  );
}

function buildHeaderProps(p: {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
  market: LiveMarketQuotesState;
  analytics: ReturnType<typeof calculatePortfolioAnalytics>;
}) {
  const { ui, ext, market, analytics } = p;
  return {
    analytics,
    theses: ui.theses,
    filter: ui.filter,
    viewMode: ui.viewMode,
    sortBy: ui.sortBy,
    query: ui.query,
    searchInputRef: ui.searchInputRef,
    onSortChange: ui.setSortBy,
    onQueryChange: ui.setQuery,
    onNewThesis: () => ui.setModal("create", true),
    onFocusBuyZone: () => {
      ui.setViewMode("cards");
      ui.setFilter("attractive");
      ui.setSortBy("margin");
    },
    onFocusWarnings: () => {
      ui.setViewMode("cards");
      ui.setFilter("attention");
    },
    onOpenStressTest: () => ext.setStressOpen(true),
    liveQuotes: market.quotes,
    activeMarketSource: market.activeSource,
    loadingQuotes: market.loading,
    calibratingPrices: ext.refreshingPrices,
    onRefreshQuotes: () => void market.refresh(true),
    onCalibratePrices: () => void ext.refreshPrices(),
    onOpenMarketSettings: () => ui.setModal("ai", true),
    onSelectThesis: ui.setPreviewThesis,
  };
}

function CockpitMainStage(p: {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
  market: LiveMarketQuotesState;
  analytics: ReturnType<typeof calculatePortfolioAnalytics>;
}) {
  const { ui, ext, market, analytics } = p;
  return (
    <div className="w-full space-y-5 px-5 pb-10 pt-5 sm:px-8 lg:px-9 lg:pt-5">
      <CockpitHeader {...buildHeaderProps(p)} />
      <ThesisCollectionView
        theses={ui.visibleTheses}
        allTheses={ui.theses}
        liveQuotes={market.quotes}
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
  const activeTickers = useMemo(
    () => ui.theses.filter((t) => t.status === "active").map((t) => t.ticker),
    [ui.theses],
  );
  const market = useLiveMarketQuotes(activeTickers);
  const ext = usePortfolioOverlayState(ui, market.mergeQuotes);
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
        <CockpitMainStage ui={ui} ext={ext} market={market} analytics={analytics} />
      </WorkbenchShell>
      <CockpitOverlays ui={ui} ext={ext} market={market} />
    </>
  );
}
