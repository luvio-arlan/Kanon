"use client";

import type {
  MarketDataSource,
  MarketQuoteSnapshot,
  PortfolioAnalytics,
  ThesisDetail,
} from "@kanon/core";
import { ActionMenu, Button, KANON_TITLE_SWAP, SearchField } from "@kanon/ui";
import { IconCheck, IconChevronDown, IconPlus } from "@tabler/icons-react";
import { motion } from "framer-motion";
import type { RefObject } from "react";
import { AttentionRadarStrip, LiveMarketStrip } from "@/features/portfolio";
import { PortfolioTelemetryStrip } from "./portfolio-telemetry-strip";

export type CockpitFilter = "all" | "attractive" | "attention" | "archived";
export type CockpitViewMode = "cards" | "table" | "catalysts" | "comps";
export type CockpitSortBy = "index" | "odds" | "cagr" | "margin";

export interface CockpitFilterCounts {
  all: number;
  attractive: number;
  attention: number;
  archived: number;
}

export interface CockpitHeaderProps {
  analytics: PortfolioAnalytics;
  theses: readonly ThesisDetail[];
  filter: CockpitFilter;
  viewMode: CockpitViewMode;
  sortBy: CockpitSortBy;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSortChange: (next: CockpitSortBy) => void;
  onQueryChange: (next: string) => void;
  onNewThesis: () => void;
  onFocusBuyZone: () => void;
  onFocusWarnings: () => void;
  onOpenStressTest: () => void;
  liveQuotes: Readonly<Record<string, MarketQuoteSnapshot>>;
  activeMarketSource: MarketDataSource | "none";
  loadingQuotes: boolean;
  calibratingPrices: boolean;
  onRefreshQuotes: () => void;
  onCalibratePrices: () => void;
  onOpenMarketSettings: () => void;
  onSelectThesis: (thesis: ThesisDetail) => void;
}

const SORT_OPTIONS: ReadonlyArray<{ id: CockpitSortBy; label: string }> = [
  { id: "index", label: "默认顺序" },
  { id: "odds", label: "赔率优先" },
  { id: "cagr", label: "年化优先" },
  { id: "margin", label: "安全边际" },
];

const VIEW_TITLES: Record<string, { zh: string; en: string }> = {
  matrix: { zh: "横向赔率矩阵", en: "Comparison" },
  catalysts: { zh: "催化剂日程", en: "Catalysts" },
  comps: { zh: "同业预期横评", en: "Peer Comps" },
  all: { zh: "研究总览", en: "Convictions" },
  attractive: { zh: "高赔率机会", en: "Asymmetry" },
  attention: { zh: "假设预警", en: "Vigilance" },
  archived: { zh: "已否决归档", en: "Archive" },
};

function SortDropdown({
  sortBy,
  onSortChange,
}: {
  sortBy: CockpitSortBy;
  onSortChange: (next: CockpitSortBy) => void;
}) {
  const activeLabel = SORT_OPTIONS.find((opt) => opt.id === sortBy)?.label ?? "默认顺序";
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
      triggerClassName="h-10 px-3.5"
      trigger={
        <>
          <span>{activeLabel}</span>
          <IconChevronDown size={14} stroke={1.5} className="text-ink-muted" />
        </>
      }
    />
  );
}

function MastheadActions(props: CockpitHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <SearchField
        value={props.query}
        onChange={props.onQueryChange}
        inputRef={props.searchInputRef}
        placeholder="筛选代码或公司 ( / )"
        ariaLabel="筛选标的"
        className="w-full sm:w-56"
      />
      {props.viewMode === "cards" ? (
        <SortDropdown sortBy={props.sortBy} onSortChange={props.onSortChange} />
      ) : null}
      <Button variant="primary" size="md" onClick={props.onNewThesis}>
        <IconPlus size={16} stroke={1.5} />
        <span>新建标的</span>
      </Button>
    </div>
  );
}

function EditorialMasthead(props: CockpitHeaderProps) {
  const titleKey =
    props.viewMode === "table"
      ? "matrix"
      : props.viewMode === "catalysts" || props.viewMode === "comps"
        ? props.viewMode
        : props.filter;
  const meta = VIEW_TITLES[titleKey] ?? { zh: "研究总览", en: "Convictions" };

  return (
    <header className="flex flex-col justify-between gap-4 border-b border-hairline pb-5 pt-1 xl:flex-row xl:items-end">
      <div className="space-y-2">
        <motion.div
          key={`rule-${titleKey}`}
          initial={{ scaleX: 0.35, opacity: 0.5 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="h-[1.5px] w-8 origin-left bg-accent-coral"
        />
        <motion.div
          key={titleKey}
          variants={KANON_TITLE_SWAP}
          initial="hidden"
          animate="visible"
          className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1"
        >
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink-primary sm:text-[32px]">
            {meta.zh}
          </h1>
          <span className="kanon-serif-italic text-2xl sm:text-[30px]">{meta.en}</span>
        </motion.div>
        <AttentionRadarStrip
          analytics={props.analytics}
          onFocusBuyZone={props.onFocusBuyZone}
          onFocusWarnings={props.onFocusWarnings}
          onOpenStressTest={props.onOpenStressTest}
        />
      </div>
      <MastheadActions {...props} />
    </header>
  );
}

export function CockpitHeader(props: CockpitHeaderProps) {
  return (
    <section className="space-y-4">
      <EditorialMasthead {...props} />
      <LiveMarketStrip
        theses={props.theses}
        quotes={props.liveQuotes}
        activeSource={props.activeMarketSource}
        loadingQuotes={props.loadingQuotes}
        calibrating={props.calibratingPrices}
        onRefreshQuotes={props.onRefreshQuotes}
        onCalibratePrices={props.onCalibratePrices}
        onOpenMarketSettings={props.onOpenMarketSettings}
        onSelectThesis={props.onSelectThesis}
      />
      <PortfolioTelemetryStrip
        analytics={props.analytics}
        theses={props.theses}
        onOpenStressTest={props.onOpenStressTest}
      />
    </section>
  );
}
