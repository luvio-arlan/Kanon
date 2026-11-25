"use client";

import type { PublicUser, ThesisDetail } from "@kanon/core";
import {
  cn,
  KanonMark,
  SidebarNavItem,
  SidebarSearchTrigger,
  SidebarSection,
  SidebarThemeSwitch,
} from "@kanon/ui";
import {
  IconAlertTriangle,
  IconArchive,
  IconCalendarEvent,
  IconChartHistogram,
  IconLayoutGrid,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconSettings,
  IconTable,
  IconTargetArrow,
} from "@tabler/icons-react";
import { AccountMenu } from "@/features/auth";
import type { CockpitFilter, CockpitFilterCounts, CockpitViewMode } from "./cockpit-header";
import { CockpitToolsNav, QuickThesesNav } from "./cockpit-sidebar-sections";

const OFFICIAL_SITE_URL = "https://kanon.hk";

export interface CockpitSidebarProps {
  currentUser: PublicUser;
  theses: readonly ThesisDetail[];
  filter: CockpitFilter;
  filterCounts: CockpitFilterCounts;
  viewMode: CockpitViewMode;
  refreshingPrices: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onSelectFilter: (next: CockpitFilter) => void;
  onSelectViewMode: (next: CockpitViewMode) => void;
  onOpenCommand: () => void;
  onRefreshPrices: () => void;
  onOpenStressTest: () => void;
  onOpenSettings: () => void;
  onOpenAccountSettings?: () => void;
}

function SidebarBrandRow(p: { collapsed: boolean; onToggleCollapse: () => void }) {
  return (
    <div
      className={cn(
        "flex items-center px-3 pb-2 pt-3.5",
        p.collapsed ? "flex-col gap-2.5 px-2" : "justify-between",
      )}
    >
      <a
        href={OFFICIAL_SITE_URL}
        target="_blank"
        rel="noreferrer"
        title="KANON 官网"
        className="inline-flex items-center gap-2.5 text-ink-primary transition-opacity hover:opacity-75"
      >
        <KanonMark size={20} accent />
        {!p.collapsed ? (
          <span className="text-sm font-semibold tracking-[0.24em]">KANON</span>
        ) : null}
      </a>
      <button
        type="button"
        onClick={p.onToggleCollapse}
        aria-label={p.collapsed ? "展开侧栏" : "收起侧栏"}
        className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary lg:flex"
      >
        {p.collapsed ? (
          <IconLayoutSidebarLeftExpand size={17} stroke={1.5} />
        ) : (
          <IconLayoutSidebarLeftCollapse size={17} stroke={1.5} />
        )}
      </button>
    </div>
  );
}

const VIEW_DEFS: ReadonlyArray<{
  id: string;
  label: string;
  mode: CockpitViewMode;
  filter: CockpitFilter;
  countKey?: keyof CockpitFilterCounts;
  Icon: typeof IconLayoutGrid;
}> = [
  {
    id: "all",
    label: "研究总览",
    mode: "cards",
    filter: "all",
    countKey: "all",
    Icon: IconLayoutGrid,
  },
  {
    id: "attractive",
    label: "高赔率机会",
    mode: "cards",
    filter: "attractive",
    countKey: "attractive",
    Icon: IconTargetArrow,
  },
  {
    id: "attention",
    label: "假设预警",
    mode: "cards",
    filter: "attention",
    countKey: "attention",
    Icon: IconAlertTriangle,
  },
  { id: "matrix", label: "横向赔率矩阵", mode: "table", filter: "all", Icon: IconTable },
  { id: "comps", label: "同业预期横评", mode: "comps", filter: "all", Icon: IconChartHistogram },
  {
    id: "catalysts",
    label: "催化剂日程",
    mode: "catalysts",
    filter: "all",
    Icon: IconCalendarEvent,
  },
  {
    id: "archived",
    label: "已归档观察",
    mode: "cards",
    filter: "archived",
    countKey: "archived",
    Icon: IconArchive,
  },
];

function PrimaryViewsNav(p: CockpitSidebarProps) {
  const upcomingCatalysts = p.theses
    .filter((t) => t.status === "active")
    .reduce((sum, t) => sum + t.catalysts.filter((c) => c.status === "upcoming").length, 0);
  const visible = VIEW_DEFS.filter((d) => d.id !== "archived" || p.filterCounts.archived > 0);
  return (
    <SidebarSection title="投研视图" collapsed={p.collapsed}>
      {visible.map(({ id, label, mode, filter, countKey, Icon }) => {
        const active =
          mode === "cards" ? p.viewMode === "cards" && p.filter === filter : p.viewMode === mode;
        const badge =
          id === "catalysts"
            ? upcomingCatalysts || undefined
            : countKey
              ? p.filterCounts[countKey]
              : undefined;
        return (
          <SidebarNavItem
            key={id}
            label={label}
            icon={<Icon size={17} stroke={1.5} />}
            badge={badge}
            active={active}
            collapsed={p.collapsed}
            layoutId="cockpit-nav"
            onClick={() => {
              p.onSelectViewMode(mode);
              p.onSelectFilter(filter);
              p.onCloseMobile();
            }}
          />
        );
      })}
    </SidebarSection>
  );
}

function SidebarFooterControls(props: CockpitSidebarProps) {
  return (
    <div
      className={cn(
        "shrink-0 space-y-2 border-t border-hairline py-3",
        props.collapsed ? "flex flex-col items-center px-2" : "px-3",
      )}
    >
      <SidebarNavItem
        label="工作台设置"
        icon={<IconSettings size={17} stroke={1.5} />}
        collapsed={props.collapsed}
        onClick={() => {
          props.onCloseMobile();
          props.onOpenSettings();
        }}
      />
      <SidebarThemeSwitch collapsed={props.collapsed} />
      <AccountMenu
        currentUser={props.currentUser}
        collapsed={props.collapsed}
        sidebar
        onOpenAccountSettings={() => {
          props.onCloseMobile();
          props.onOpenAccountSettings?.();
        }}
      />
    </div>
  );
}

export function CockpitSidebar(props: CockpitSidebarProps) {
  return (
    <div className="flex h-full flex-col justify-between overflow-hidden">
      <div className="kanon-scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-3">
        <SidebarBrandRow collapsed={props.collapsed} onToggleCollapse={props.onToggleCollapse} />
        <div className={props.collapsed ? "px-2" : "px-3"}>
          <SidebarSearchTrigger collapsed={props.collapsed} onClick={props.onOpenCommand} />
        </div>
        <nav
          aria-label="研究工作台导航"
          className={cn("space-y-4", props.collapsed ? "px-2" : "px-3")}
        >
          <PrimaryViewsNav {...props} />
          <QuickThesesNav
            theses={props.theses}
            collapsed={props.collapsed}
            onCloseMobile={props.onCloseMobile}
          />
          <CockpitToolsNav
            refreshingPrices={props.refreshingPrices}
            collapsed={props.collapsed}
            onCloseMobile={props.onCloseMobile}
            onRefreshPrices={props.onRefreshPrices}
            onOpenStressTest={props.onOpenStressTest}
          />
        </nav>
      </div>
      <SidebarFooterControls {...props} />
    </div>
  );
}
