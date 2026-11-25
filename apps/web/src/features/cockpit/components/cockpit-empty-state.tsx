"use client";

import type { ThesisDetail } from "@kanon/core";
import { Button, Spinner } from "@kanon/ui";
import { IconArrowUpRight, IconPlus, IconRotate2 } from "@tabler/icons-react";
import { useState } from "react";
import {
  apiCreateThesis,
  INSTITUTIONAL_THESIS_PRESETS,
  type NewThesisDraft,
} from "../lib/cockpit-api";
import type { CockpitFilter } from "./cockpit-header";

export interface CockpitEmptyStateProps {
  filter: CockpitFilter;
  query: string;
  totalActiveCount: number;
  onResetFilters: () => void;
  onNewThesis: () => void;
  onCreated: (thesis: ThesisDetail) => void;
}

function resolveEmptyCopy(filter: CockpitFilter, query: string) {
  if (query.trim()) {
    return { title: `未找到「${query.trim()}」`, hint: "试试股票代码或清除当前筛选条件" };
  }
  if (filter === "attractive") {
    return { title: "暂无高赔率标的", hint: "赔率 ≥ 2.0× 且具安全边际的标的会自动汇总于此" };
  }
  if (filter === "attention") {
    return { title: "当前无假设预警", hint: "所有核心假设状态清晰，无触发证伪阈值项" };
  }
  return { title: "当前视图暂无标的", hint: "可返回全部视图或新建一份研究档案" };
}

function BenchmarkPresetCard({
  preset,
  busy,
  disabled,
  onSelect,
}: {
  preset: NewThesisDraft;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className="group flex cursor-pointer flex-col justify-between rounded-panel border border-hairline bg-canvas/70 p-4 text-left transition-[border-color,background-color,box-shadow] duration-150 ease-[var(--ease-kanon)] hover:border-strong hover:bg-surface hover:shadow-card disabled:cursor-not-allowed disabled:opacity-55"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-badge border border-hairline bg-titanium px-2 py-0.5 font-mono text-xs font-semibold text-ink-primary tabular-nums">
            {preset.ticker}
          </span>
          <span className="font-mono text-xs text-ink-muted tabular-nums">
            ${preset.currentPrice}
          </span>
        </div>
        <div className="mt-3 text-base font-semibold text-ink-primary transition-colors group-hover:text-accent-coral">
          {preset.companyName}
        </div>
        <div className="mt-0.5 text-xs text-ink-muted">{preset.sectorTag}</div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3 text-xs font-medium text-ink-secondary group-hover:text-ink-primary">
        <span>{busy ? "初始化档案..." : "一键建立五步档案"}</span>
        {busy ? <Spinner size="xs" decorative /> : <IconArrowUpRight size={14} stroke={1.5} />}
      </div>
    </button>
  );
}

function ResearchKickstartDesk({
  onNewThesis,
  onCreated,
}: {
  onNewThesis: () => void;
  onCreated: (thesis: ThesisDetail) => void;
}) {
  const [creatingTicker, setCreatingTicker] = useState<string | null>(null);

  async function handleQuickStart(preset: NewThesisDraft) {
    if (creatingTicker) return;
    setCreatingTicker(preset.ticker);
    const created = await apiCreateThesis(preset).finally(() => setCreatingTicker(null));
    if (created) onCreated(created);
  }

  return (
    <section className="rounded-card border border-hairline bg-surface p-6 shadow-card sm:p-8">
      <div className="flex flex-col justify-between gap-4 border-b border-hairline pb-5 sm:flex-row sm:items-center">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink-primary">
          开启第一份研究档案
        </h2>
        <Button variant="primary" size="md" onClick={onNewThesis}>
          <IconPlus size={16} stroke={1.5} />
          <span>新建标的</span>
        </Button>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
        {INSTITUTIONAL_THESIS_PRESETS.map((preset) => (
          <BenchmarkPresetCard
            key={preset.ticker}
            preset={preset}
            busy={creatingTicker === preset.ticker}
            disabled={creatingTicker !== null}
            onSelect={() => void handleQuickStart(preset)}
          />
        ))}
      </div>
    </section>
  );
}

export function CockpitEmptyState(props: CockpitEmptyStateProps) {
  if (props.totalActiveCount === 0 && !props.query.trim()) {
    return <ResearchKickstartDesk onNewThesis={props.onNewThesis} onCreated={props.onCreated} />;
  }
  const copy = resolveEmptyCopy(props.filter, props.query);
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-card border border-hairline bg-surface px-6 py-12 text-center shadow-card">
      <h2 className="text-lg font-semibold text-ink-primary">{copy.title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-secondary">{copy.hint}</p>
      <div className="mt-6 flex items-center gap-2.5">
        <Button variant="outline" size="md" onClick={props.onResetFilters}>
          <IconRotate2 size={15} stroke={1.5} />
          <span>查看全部标的</span>
        </Button>
        <Button variant="primary" size="md" onClick={props.onNewThesis}>
          <IconPlus size={15} stroke={1.5} />
          <span>新建标的</span>
        </Button>
      </div>
    </div>
  );
}
