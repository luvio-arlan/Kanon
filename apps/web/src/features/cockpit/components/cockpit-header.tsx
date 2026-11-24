"use client";

import type { PortfolioAnalytics } from "@kanon/core";
import { ActionMenu, cn, KANON_SPRING } from "@kanon/ui";
import {
  IconCheck,
  IconChevronDown,
  IconLayoutGrid,
  IconSearch,
  IconTable,
  IconX,
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import type { ReactNode, RefObject } from "react";
import { PortfolioTelemetryStrip } from "./portfolio-telemetry-strip";

export type CockpitFilter = "all" | "attractive" | "attention" | "archived";
export type CockpitViewMode = "cards" | "table";
export type CockpitSortBy = "index" | "odds" | "cagr" | "margin";

export interface CockpitHeaderProps {
  analytics: PortfolioAnalytics;
  filter: CockpitFilter;
  viewMode: CockpitViewMode;
  sortBy: CockpitSortBy;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onFilterChange: (next: CockpitFilter) => void;
  onViewModeChange: (next: CockpitViewMode) => void;
  onSortChange: (next: CockpitSortBy) => void;
  onQueryChange: (next: string) => void;
}

const SORT_OPTIONS: ReadonlyArray<{ id: CockpitSortBy; label: string }> = [
  { id: "index", label: "默认编号" },
  { id: "odds", label: "赔率优先" },
  { id: "cagr", label: "CAGR 优先" },
  { id: "margin", label: "安全边际" },
];

function FilterTabs({
  filter,
  archivedCount,
  onFilterChange,
}: {
  filter: CockpitFilter;
  archivedCount: number;
  onFilterChange: (next: CockpitFilter) => void;
}) {
  const options: Array<{ id: CockpitFilter; label: string }> = [
    { id: "all", label: "全部标的" },
    { id: "attractive", label: "高赔率" },
    { id: "attention", label: "需关注" },
    ...(archivedCount > 0 ? [{ id: "archived" as const, label: `已否决 (${archivedCount})` }] : []),
  ];

  return (
    <div className="inline-flex items-center rounded-pill border border-hairline bg-titanium-subtle p-1 shadow-card">
      {options.map((option) => {
        const active = filter === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onFilterChange(option.id)}
            className={cn(
              "relative cursor-pointer rounded-pill px-3.5 py-1.5 text-xs font-medium transition-colors duration-150",
              active ? "text-ink-primary" : "text-ink-secondary hover:text-ink-primary",
            )}
          >
            {active ? (
              <motion.span
                layoutId="cockpit-filter-pill"
                transition={KANON_SPRING}
                className="absolute inset-0 rounded-pill border border-hairline bg-surface shadow-card"
              />
            ) : null}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ViewModeSwitch({
  viewMode,
  onChange,
}: {
  viewMode: CockpitViewMode;
  onChange: (next: CockpitViewMode) => void;
}) {
  const modes: ReadonlyArray<{ id: CockpitViewMode; label: string; icon: ReactNode }> = [
    { id: "cards", label: "卡片", icon: <IconLayoutGrid size={14} stroke={1.5} /> },
    { id: "table", label: "赔率对比", icon: <IconTable size={14} stroke={1.5} /> },
  ];
  return (
    <div className="inline-flex items-center rounded-pill border border-hairline bg-surface p-1 shadow-card">
      {modes.map((m) => {
        const active = viewMode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={cn(
              "relative inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium transition-colors",
              active ? "text-ink-primary" : "text-ink-secondary hover:text-ink-primary",
            )}
          >
            {active ? (
              <motion.span
                layoutId="cockpit-view-pill"
                transition={KANON_SPRING}
                className="absolute inset-0 rounded-pill bg-titanium-subtle"
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {m.icon}
              <span>{m.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SortDropdown({
  sortBy,
  onSortChange,
}: {
  sortBy: CockpitSortBy;
  onSortChange: (next: CockpitSortBy) => void;
}) {
  const activeSortLabel = SORT_OPTIONS.find((opt) => opt.id === sortBy)?.label ?? "默认编号";
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
      triggerClassName="h-9 rounded-pill px-3.5 shadow-card"
      trigger={
        <>
          <span>排序：{activeSortLabel}</span>
          <IconChevronDown size={13} stroke={1.5} className="text-ink-muted" />
        </>
      }
    />
  );
}

function SearchAndSortControls(props: {
  query: string;
  sortBy: CockpitSortBy;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (next: string) => void;
  onSortChange: (next: CockpitSortBy) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
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
          placeholder="筛选代码 / 赛道 ( / )"
          aria-label="筛选标的"
          className="h-9 w-48 rounded-pill border border-hairline bg-surface pl-8 pr-7 text-xs text-ink-primary shadow-card placeholder:text-ink-muted focus:border-strong focus:outline-none focus:ring-2 focus:ring-accent-coral/40 sm:w-56"
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
      <SortDropdown sortBy={props.sortBy} onSortChange={props.onSortChange} />
    </div>
  );
}

export function CockpitHeader(props: CockpitHeaderProps) {
  return (
    <section className="pb-8 pt-10">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="kanon-micro-label text-ink-muted">KANON · FUNDAMENTAL CONVICTION OS</div>
          <h1 className="mt-1.5 text-3xl font-semibold leading-tight tracking-[-0.03em] text-ink-primary sm:text-[34px]">
            在噪音里，谱出自己的确定性。
          </h1>
        </div>
        <SearchAndSortControls
          query={props.query}
          sortBy={props.sortBy}
          searchInputRef={props.searchInputRef}
          onQueryChange={props.onQueryChange}
          onSortChange={props.onSortChange}
        />
      </div>

      <PortfolioTelemetryStrip analytics={props.analytics} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          filter={props.filter}
          archivedCount={props.analytics.archivedCount}
          onFilterChange={props.onFilterChange}
        />
        <ViewModeSwitch viewMode={props.viewMode} onChange={props.onViewModeChange} />
      </div>
    </section>
  );
}
