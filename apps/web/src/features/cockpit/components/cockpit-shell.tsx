"use client";

import {
  calculatePortfolioAnalytics,
  type GlossaryTerm,
  type PublicUser,
  type ThesisDetail,
} from "@kanon/core";
import { Button, WorkbenchShell } from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type { SettingsTabId } from "@/features/ai-settings";
import { useCockpitState } from "../lib/cockpit-state";
import type { CockpitViewState } from "../lib/cockpit-view-params";
import { useLiveMarketQuotes } from "../lib/use-live-market-quotes";
import { usePortfolioOverlayState } from "../lib/use-portfolio-overlays";
import { CockpitHeader } from "./cockpit-header";
import { CockpitSidebar } from "./cockpit-sidebar";
import { CockpitOverlays } from "./overlays/cockpit-overlays";
import { type CockpitStageProps, ThesisCollectionView } from "./views/cockpit-collection-view";

export interface CockpitShellProps {
  initialTheses: ThesisDetail[];
  glossary: readonly GlossaryTerm[];
  currentUser: PublicUser;
  initialView?: CockpitViewState;
}

function buildHeaderProps(
  { ui, ext, analytics }: CockpitStageProps,
  ledgerOpen: boolean,
  onCloseLedger: () => void,
) {
  return {
    analytics,
    theses: ui.theses,
    filter: ui.filter,
    viewMode: ui.viewMode,
    sortBy: ui.sortBy,
    query: ui.query,
    searchInputRef: ui.searchInputRef,
    ledgerOpen,
    onCloseLedger,
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
  };
}

function useCockpitRuntime(
  initialTheses: ThesisDetail[],
  glossary: readonly GlossaryTerm[],
  initialView?: CockpitViewState,
) {
  const ui = useCockpitState(initialTheses, glossary, initialView);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>("general");
  const [ledgerOpen, setLedgerOpen] = useState(false);
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
  ui.externalOverlayOpenRef.current =
    ext.compareOpen || ext.importOpen || ext.stressOpen || ext.calibrationOpen || ledgerOpen;
  const analytics = useMemo(() => calculatePortfolioAnalytics(ui.theses), [ui.theses]);
  return { ui, settingsTab, ledgerOpen, setLedgerOpen, openSettings, market, ext, analytics };
}

function buildSidebarProps(
  currentUser: PublicUser,
  r: ReturnType<typeof useCockpitRuntime>,
  s: {
    collapsed: boolean;
    isMobile: boolean;
    onToggleCollapse: () => void;
    closeMobile: () => void;
  },
) {
  return {
    currentUser,
    theses: r.ui.theses,
    filter: r.ui.filter,
    filterCounts: r.ui.filterCounts,
    viewMode: r.ui.viewMode,
    refreshingPrices: r.ext.refreshingPrices,
    collapsed: s.collapsed,
    isMobile: s.isMobile,
    onToggleCollapse: s.onToggleCollapse,
    onCloseMobile: s.closeMobile,
    onSelectFilter: r.ui.setFilter,
    onSelectViewMode: r.ui.setViewMode,
    onOpenCommand: () => r.ui.setModal("cmd", true),
    onRefreshPrices: () => void r.ext.refreshPrices(),
    onOpenStressTest: () => r.ext.setStressOpen(true),
    onOpenCalibration: () => r.ext.setCalibrationOpen(true),
    onOpenLedger: () => r.setLedgerOpen(true),
    onOpenSettings: () => r.openSettings("general"),
    onOpenAccountSettings: () => r.openSettings("account"),
  };
}

export function CockpitShell({
  initialTheses,
  glossary,
  currentUser,
  initialView,
}: CockpitShellProps) {
  const r = useCockpitRuntime(initialTheses, glossary, initialView);
  const openMarketSettings = () => r.openSettings("market");
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
            {...buildHeaderProps(
              { ...r, onOpenMarketSettings: openMarketSettings },
              r.ledgerOpen,
              () => r.setLedgerOpen(false),
            )}
          />
          <ThesisCollectionView {...r} onOpenMarketSettings={openMarketSettings} />
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
