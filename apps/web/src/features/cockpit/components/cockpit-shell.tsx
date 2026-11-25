"use client";

import {
  calculatePortfolioAnalytics,
  type GlossaryTerm,
  type PublicUser,
  type ThesisDetail,
} from "@kanon/core";
import {
  Button,
  cn,
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
  onOpenMarketSettings: () => void;
}

function ThesisCardsGrid({ ui, market }: Pick<MainStageProps, "ui" | "market">) {
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

function renderCollectionBody({ ui, ext, market, analytics }: MainStageProps) {
  const searchedTheses = ui.query.trim() ? ui.visibleTheses : ui.theses;
  if (ui.viewMode === "catalysts") return <CatalystCalendarBoard theses={searchedTheses} />;
  if (ui.viewMode === "comps") {
    return <PeerExpectationsMatrix theses={searchedTheses} liveQuotes={market.quotes} />;
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

function buildHeaderProps({ ui, ext, market, analytics, onOpenMarketSettings }: MainStageProps) {
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
    onOpenMarketSettings,
    onSelectThesis: ui.setPreviewThesis,
  };
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

function buildSidebarProps(
  currentUser: PublicUser,
  r: ReturnType<typeof useCockpitRuntime>,
  s: { collapsed: boolean; onToggleCollapse: () => void; closeMobile: () => void },
) {
  return {
    currentUser,
    theses: r.ui.theses,
    filter: r.ui.filter,
    filterCounts: r.ui.filterCounts,
    viewMode: r.ui.viewMode,
    refreshingPrices: r.ext.refreshingPrices,
    collapsed: s.collapsed,
    onToggleCollapse: s.onToggleCollapse,
    onCloseMobile: s.closeMobile,
    onSelectFilter: r.ui.setFilter,
    onSelectViewMode: r.ui.setViewMode,
    onOpenCommand: () => r.ui.setModal("cmd", true),
    onRefreshPrices: () => void r.ext.refreshPrices(),
    onOpenStressTest: () => r.ext.setStressOpen(true),
    onOpenCalibration: () => r.ext.setCalibrationOpen(true),
    onOpenSettings: () => r.openSettings("general"),
    onOpenAccountSettings: () => r.openSettings("account"),
  };
}

export function CockpitShell({ initialTheses, glossary, currentUser }: CockpitShellProps) {
  const r = useCockpitRuntime(initialTheses, glossary);
  const mobileBtn = (
    <Button variant="primary" size="sm" onClick={() => r.ui.setModal("create", true)}>
      <IconPlus size={15} stroke={1.5} />
      <span>新建</span>
    </Button>
  );
  return (
    <>
      <WorkbenchShell
        mobileActions={mobileBtn}
        sidebar={(s) => <CockpitSidebar {...buildSidebarProps(currentUser, r, s)} />}
      >
        <div className="w-full space-y-5 px-5 pb-10 pt-5 sm:px-8 lg:px-9 lg:pt-5">
          <CockpitHeader
            {...buildHeaderProps({ ...r, onOpenMarketSettings: () => r.openSettings("market") })}
          />
          <ThesisCollectionView {...r} onOpenMarketSettings={() => r.openSettings("market")} />
        </div>
      </WorkbenchShell>
      <CockpitOverlays
        ui={r.ui}
        ext={r.ext}
        market={r.market}
        currentUser={currentUser}
        settingsTab={r.settingsTab}
      />
    </>
  );
}
