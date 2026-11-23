"use client";

import { cn, KANON_SPRING } from "@kanon/ui";
import { motion } from "framer-motion";

export type CockpitFilter = "all" | "attractive" | "attention";

export interface CockpitHeaderProps {
  totalCount: number;
  validatedCount: number;
  totalHypotheses: number;
  averageRiskReward: number | null;
  filter: CockpitFilter;
  onFilterChange: (next: CockpitFilter) => void;
}

const FILTER_OPTIONS: ReadonlyArray<{ id: CockpitFilter; label: string }> = [
  { id: "all", label: "全部标的" },
  { id: "attractive", label: "高赔率" },
  { id: "attention", label: "需关注" },
];

function FilterTabs({
  filter,
  onFilterChange,
}: {
  filter: CockpitFilter;
  onFilterChange: (next: CockpitFilter) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-pill border border-hairline bg-titanium-subtle p-1 shadow-card">
      {FILTER_OPTIONS.map((option) => {
        const active = filter === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onFilterChange(option.id)}
            className={cn(
              "relative cursor-pointer rounded-pill px-4 py-1.5 text-sm font-medium transition-colors duration-150",
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

export function CockpitHeader({
  totalCount,
  validatedCount,
  totalHypotheses,
  averageRiskReward,
  filter,
  onFilterChange,
}: CockpitHeaderProps) {
  return (
    <section className="flex flex-col justify-between gap-6 pb-9 pt-12 md:flex-row md:items-end">
      <div>
        <h1 className="text-3xl font-semibold leading-tight tracking-[-0.03em] text-ink-primary sm:text-[34px]">
          在噪音里，谱出自己的确定性。
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-secondary">
          <span className="tabular-nums">跟踪 {totalCount} 只标的</span>
          <span aria-hidden="true" className="text-ink-muted">
            ·
          </span>
          <span className="inline-flex items-center gap-2 tabular-nums">
            <span className="h-2 w-2 rounded-pill bg-status-pass" />
            {validatedCount}/{totalHypotheses} 核心假设已验证
          </span>
          <span aria-hidden="true" className="text-ink-muted">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-titanium-subtle px-2.5 py-0.5 font-mono text-xs font-medium text-ink-primary tabular-nums">
            平均赔率 {averageRiskReward !== null ? `${averageRiskReward.toFixed(2)}×` : "∞"}
          </span>
        </div>
      </div>

      <FilterTabs filter={filter} onFilterChange={onFilterChange} />
    </section>
  );
}
