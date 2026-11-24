"use client";

import type { PortfolioAnalytics } from "@kanon/core";
import { ActionMenu, SegmentedTabs } from "@kanon/ui";
import {
  IconCheck,
  IconChevronDown,
  IconLayoutGrid,
  IconSearch,
  IconTable,
  IconX,
} from "@tabler/icons-react";
import type { RefObject } from "react";
import { AttentionRadarStrip } from "@/features/portfolio";
import { PortfolioTelemetryStrip } from "./portfolio-telemetry-strip";

export type CockpitFilter = "all" | "attractive" | "attention" | "archived";
export type CockpitViewMode = "cards" | "table";
export type CockpitSortBy = "index" | "odds" | "cagr" | "margin";

export interface CockpitFilterCounts {
  all: number;
  attractive: number;
  attention: number;
  archived: number;
}

export interface CockpitHeaderProps {
  analytics: PortfolioAnalytics;
  filter: CockpitFilter;
  filterCounts: CockpitFilterCounts;
  viewMode: CockpitViewMode;
  sortBy: CockpitSortBy;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onFilterChange: (next: CockpitFilter) => void;
  onViewModeChange: (next: CockpitViewMode) => void;
  onSortChange: (next: CockpitSortBy) => void;
  onQueryChange: (next: string) => void;
  onFocusBuyZone: () => void;
  onFocusWarnings: () => void;
  onOpenStressTest: () => void;
}

const SORT_OPTIONS: ReadonlyArray<{ id: CockpitSortBy; label: string }> = [
  { id: "index", label: "默认" },
  { id: "odds", label: "赔率优先" },
  { id: "cagr", label: "年化优先" },
  { id: "margin", label: "安全边际" },
];

function SortDropdown({
  sortBy,
  onSortChange,
}: {
  sortBy: CockpitSortBy;
  onSortChange: (next: CockpitSortBy) => void;
}) {
  const activeSortLabel = SORT_OPTIONS.find((opt) => opt.id === sortBy)?.label ?? "默认";
  const items = SORT_OPTIONS.map((opt) => ({
    id: opt.id,
    label: opt.label,
    icon:
      sortBy === opt.id ? (
        <IconCheck size={14} stroke={1.5} />
      ) : (
        <span className="inline-block w-3.5" />
      ),
    onSelect: () => onSortChange(opt.id),
  }));

  return (
    <ActionMenu
      ariaLabel="标的排序方式"
      items={items}
      triggerClassName="h-9 rounded-pill px-3"
      trigger={
        <>
          <span>{activeSortLabel}</span>
          <IconChevronDown size={13} stroke={1.5} className="text-ink-muted" />
        </>
      }
    />
  );
}

function InlineFilterInput(props: {
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (next: string) => void;
}) {
  return (
    <div className="relative flex items-center">
      <IconSearch
        size={14}
        stroke={1.5}
        className="pointer-events-none absolute left-3 text-ink-muted"
      />
      <input
        ref={props.searchInputRef}
        type="text"
        value={props.query}
        onChange={(e) => props.onQueryChange(e.target.value)}
        placeholder="筛选代码 ( / )"
        aria-label="筛选标的"
        className="h-9 w-40 rounded-pill border border-hairline bg-surface pl-8 pr-7 text-xs text-ink-primary transition-colors placeholder:text-ink-muted focus:border-strong focus:outline-none focus:ring-1 focus:ring-accent-coral/50 sm:w-44"
      />
      {props.query ? (
        <button
          type="button"
          onClick={() => props.onQueryChange("")}
          aria-label="清除筛选"
          className="absolute right-2.5 cursor-pointer text-ink-muted hover:text-ink-primary"
        >
          <IconX size={13} stroke={1.5} />
        </button>
      ) : null}
    </div>
  );
}

function CockpitControlBar(props: CockpitHeaderProps) {
  const filterItems = [
    { id: "all" as const, label: "全部", count: props.filterCounts.all },
    { id: "attractive" as const, label: "高赔率", count: props.filterCounts.attractive },
    { id: "attention" as const, label: "需关注", count: props.filterCounts.attention },
    ...(props.filterCounts.archived > 0
      ? [{ id: "archived" as const, label: "已否决", count: props.filterCounts.archived }]
      : []),
  ];

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <SegmentedTabs
        layoutId="cockpit-filter-pill"
        value={props.filter}
        onChange={props.onFilterChange}
        items={filterItems}
      />
      <div className="flex flex-wrap items-center gap-2">
        <InlineFilterInput
          query={props.query}
          searchInputRef={props.searchInputRef}
          onQueryChange={props.onQueryChange}
        />
        <SortDropdown sortBy={props.sortBy} onSortChange={props.onSortChange} />
        <SegmentedTabs
          layoutId="cockpit-view-pill"
          value={props.viewMode}
          onChange={props.onViewModeChange}
          items={[
            { id: "cards", label: "卡片", icon: <IconLayoutGrid size={13} stroke={1.5} /> },
            { id: "table", label: "矩阵", icon: <IconTable size={13} stroke={1.5} /> },
          ]}
        />
      </div>
    </div>
  );
}

export function CockpitHeader(props: CockpitHeaderProps) {
  return (
    <section className="pb-6 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink-primary">研究工作台</h1>
        <AttentionRadarStrip
          analytics={props.analytics}
          onFocusBuyZone={props.onFocusBuyZone}
          onFocusWarnings={props.onFocusWarnings}
          onOpenStressTest={props.onOpenStressTest}
        />
      </div>
      <PortfolioTelemetryStrip
        analytics={props.analytics}
        onOpenStressTest={props.onOpenStressTest}
      />
      <CockpitControlBar {...props} />
    </section>
  );
}
