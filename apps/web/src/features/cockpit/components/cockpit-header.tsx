"use client";

import { cn, KANON_SPRING } from "@kanon/ui";
import { IconLayoutGrid, IconTable } from "@tabler/icons-react";
import { motion } from "framer-motion";

export type CockpitFilter = "all" | "attractive" | "attention" | "archived";
export type CockpitViewMode = "cards" | "table";

export interface CockpitHeaderProps {
  totalCount: number;
  archivedCount: number;
  validatedCount: number;
  totalHypotheses: number;
  averageRiskReward: number | null;
  filter: CockpitFilter;
  viewMode: CockpitViewMode;
  onFilterChange: (next: CockpitFilter) => void;
  onViewModeChange: (next: CockpitViewMode) => void;
}

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
              "relative cursor-pointer rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors duration-150",
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
  return (
    <div className="inline-flex items-center rounded-pill border border-hairline bg-surface p-1 shadow-card">
      <button
        type="button"
        onClick={() => onChange("cards")}
        aria-label="Bento 卡片视图"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium transition-colors",
          viewMode === "cards"
            ? "bg-titanium-subtle text-ink-primary"
            : "text-ink-secondary hover:text-ink-primary",
        )}
      >
        <IconLayoutGrid size={14} stroke={1.5} />
        <span>卡片</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("table")}
        aria-label="全仓赔率对比表"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium transition-colors",
          viewMode === "table"
            ? "bg-titanium-subtle text-ink-primary"
            : "text-ink-secondary hover:text-ink-primary",
        )}
      >
        <IconTable size={14} stroke={1.5} />
        <span>赔率对比</span>
      </button>
    </div>
  );
}

export function CockpitHeader(props: CockpitHeaderProps) {
  return (
    <section className="flex flex-col justify-between gap-6 pb-9 pt-12 lg:flex-row lg:items-end">
      <div>
        <h1 className="text-3xl font-semibold leading-tight tracking-[-0.03em] text-ink-primary sm:text-[34px]">
          在噪音里，谱出自己的确定性。
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-secondary">
          <span className="tabular-nums">跟踪 {props.totalCount} 只标的</span>
          <span aria-hidden="true" className="text-ink-muted">
            ·
          </span>
          <span className="inline-flex items-center gap-2 tabular-nums">
            <span className="h-2 w-2 rounded-pill bg-status-pass" />
            {props.validatedCount}/{props.totalHypotheses} 核心假设已验证
          </span>
          <span aria-hidden="true" className="text-ink-muted">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-titanium-subtle px-2.5 py-0.5 font-mono text-xs font-medium text-ink-primary tabular-nums">
            平均赔率{" "}
            {props.averageRiskReward !== null ? `${props.averageRiskReward.toFixed(2)}×` : "∞"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <FilterTabs
          filter={props.filter}
          archivedCount={props.archivedCount}
          onFilterChange={props.onFilterChange}
        />
        <ViewModeSwitch viewMode={props.viewMode} onChange={props.onViewModeChange} />
      </div>
    </section>
  );
}
