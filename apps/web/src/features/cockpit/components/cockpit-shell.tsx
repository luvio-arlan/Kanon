"use client";

import {
  calculatePortfolioAnalytics,
  type GlossaryTerm,
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
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { SettingsTabId } from "@/features/ai-settings";
import { useCockpitState } from "../lib/cockpit-state";
import { type LiveMarketQuotesState, useLiveMarketQuotes } from "../lib/use-live-market-quotes";
import { usePortfolioOverlayState } from "../lib/use-portfolio-overlays";
import { CockpitEmptyState } from "./cockpit-empty-state";
import { CockpitHeader } from "./cockpit-header";
import { CockpitSidebar } from "./cockpit-sidebar";
import { CockpitOverlays } from "./overlays/cockpit-overlays";
import { ThesisBentoCard } from "./thesis-bento-card";

const ViewSkeleton = () => (
  <div
    aria-hidden="true"
    className="kanon-shimmer h-72 w-full rounded-card border border-hairline"
  />
);
const CatalystCalendarBoard = dynamic(
  () => import("@/features/portfolio").then((m) => m.CatalystCalendarBoard),
  { ssr: false, loading: ViewSkeleton },
);
const PeerExpectationsMatrix = dynamic(
  () => import("@/features/portfolio").then((m) => m.PeerExpectationsMatrix),
  { ssr: false, loading: ViewSkeleton },
);
const PortfolioComparisonTable = dynamic(
  () => import("./portfolio-comparison-table").then((m) => m.PortfolioComparisonTable),
  { ssr: false, loading: ViewSkeleton },
);

export interface CockpitShellProps {
  initialTheses: ThesisDetail[];
  glossary: readonly GlossaryTerm[];
  currentUser: PublicUser;
}

interface MainStageProps {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
  market: LiveMarketQuotesState;
  analytics: ReturnType<typeof calculatePortfolioAnalytics>;
}

function renderCollectionBody({ ui, ext, market, analytics }: MainStageProps) {
  if (ui.viewMode === "catalysts") return <CatalystCalendarBoard theses={ui.theses} />;
  if (ui.viewMode === "comps") {
    return <PeerExpectationsMatrix theses={ui.theses} liveQuotes={market.quotes} />;
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
  return (
    <motion.section
      aria-label="跟踪标的列表"
      variants={KANON_STAGGER_CONTAINER}
      initial={false}
      animate="visible"
      className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-2 2xl:grid-cols-3"
    >
      {ui.visibleTheses.map((thesis) => (
        <motion.div key={thesis.id} variants={KANON_FADE_UP_ITEM} className="flex h-full">
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

function ThesisCollectionView(p: MainStageProps) {
  const stateKey = `${p.ui.viewMode}:${p.ui.filter}:${p.ui.visibleTheses.length === 0 ? "empty" : "list"}`;
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

function buildHeaderProps({ ui, ext, market, analytics }: MainStageProps) {
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

function CockpitMainStage(p: MainStageProps) {
  return (
    <div className="w-full space-y-5 px-5 pb-10 pt-5 sm:px-8 lg:px-9 lg:pt-5">
      <CockpitHeader {...buildHeaderProps(p)} />
      <ThesisCollectionView {...p} />
    </div>
  );
}

function useCockpitRuntime(initialTheses: ThesisDetail[], glossary: readonly GlossaryTerm[]) {
  const ui = useCockpitState(initialTheses, glossary);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>("general");
  const openSettings = (tab: SettingsTabId = "general") => {
    setSettingsTab(tab);
    ui.setModal("ai", true);
  };
  const activeTickers = useMemo(
    () => ui.theses.filter((t) => t.status === "active").map((t) => t.ticker),
    [ui.theses],
  );
  const market = useLiveMarketQuotes(activeTickers);
  const ext = usePortfolioOverlayState(ui, market.mergeQuotes);
  const analytics = useMemo(() => calculatePortfolioAnalytics(ui.theses), [ui.theses]);
  return { ui, settingsTab, openSettings, market, ext, analytics };
}

export function CockpitShell({ initialTheses, glossary, currentUser }: CockpitShellProps) {
  const { ui, settingsTab, openSettings, market, ext, analytics } = useCockpitRuntime(
    initialTheses,
    glossary,
  );
  return (
    <>
      <WorkbenchShell
        mobileActions={
          <Button variant="primary" size="sm" onClick={() => ui.setModal("create", true)}>
            <IconPlus size={15} stroke={1.5} />
            <span>新建</span>
          </Button>
        }
        sidebar={(s) => (
          <CockpitSidebar
            currentUser={currentUser}
            theses={ui.theses}
            filter={ui.filter}
            filterCounts={ui.filterCounts}
            viewMode={ui.viewMode}
            refreshingPrices={ext.refreshingPrices}
            collapsed={s.collapsed}
            onToggleCollapse={s.onToggleCollapse}
            onCloseMobile={s.closeMobile}
            onSelectFilter={ui.setFilter}
            onSelectViewMode={ui.setViewMode}
            onOpenCommand={() => ui.setModal("cmd", true)}
            onRefreshPrices={() => void ext.refreshPrices()}
            onOpenStressTest={() => ext.setStressOpen(true)}
            onOpenCalibration={() => ext.setCalibrationOpen(true)}
            onOpenSettings={() => openSettings("general")}
            onOpenAccountSettings={() => openSettings("account")}
          />
        )}
      >
        <CockpitMainStage ui={ui} ext={ext} market={market} analytics={analytics} />
      </WorkbenchShell>
      <CockpitOverlays
        ui={ui}
        ext={ext}
        market={market}
        currentUser={currentUser}
        settingsTab={settingsTab}
      />
    </>
  );
}
