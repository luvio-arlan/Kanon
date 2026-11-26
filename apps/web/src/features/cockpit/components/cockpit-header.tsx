"use client";

import type {
  MarketDataSource,
  MarketQuoteSnapshot,
  PortfolioAnalytics,
  ThesisDetail,
} from "@kanon/core";
import { ActionMenu, Button, KANON_TITLE_SWAP, SearchField } from "@kanon/ui";
import { IconChevronDown, IconInbox, IconPlus, IconWallet } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { type RefObject, useState } from "react";
import { AttentionRadarStrip, LiveMarketStrip } from "@/features/portfolio";
import { CockpitWorkflowSheets } from "./overlays/inbox-and-ledger-sheets";
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

const VIEW_TITLES: Record<string, string> = {
  matrix: "横向赔率矩阵",
  catalysts: "催化剂日程",
  comps: "同业预期横评",
  all: "研究总览",
  attractive: "高赔率机会",
  attention: "假设预警",
  archived: "已归档观察",
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
    selected: sortBy === opt.id,
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
          <IconChevronDown
            size={14}
            stroke={1.5}
            className="kanon-chevron text-ink-muted transition-transform duration-150 ease-[var(--ease-kanon)]"
          />
        </>
      }
    />
  );
}

function MastheadActions(
  props: CockpitHeaderProps & { onOpenInbox: () => void; onOpenLedger: () => void },
) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField
        value={props.query}
        onChange={props.onQueryChange}
        inputRef={props.searchInputRef}
        placeholder="筛选代码或公司 ( / )"
        ariaLabel="筛选标的"
        className="w-full sm:w-52"
      />
      {props.viewMode === "cards" ? (
        <SortDropdown sortBy={props.sortBy} onSortChange={props.onSortChange} />
      ) : null}
      <Button variant="outline" size="md" onClick={props.onOpenInbox}>
        <IconInbox size={15} stroke={1.5} />
        <span>收件箱</span>
      </Button>
      <Button variant="outline" size="md" onClick={props.onOpenLedger}>
        <IconWallet size={15} stroke={1.5} />
        <span>账本</span>
      </Button>
      <Button variant="primary" size="md" onClick={props.onNewThesis}>
        <IconPlus size={16} stroke={1.5} />
        <span>新建标的</span>
      </Button>
    </div>
  );
}

function EditorialMasthead(
  props: CockpitHeaderProps & { onOpenInbox: () => void; onOpenLedger: () => void },
) {
  const titleKey =
    props.viewMode === "table"
      ? "matrix"
      : props.viewMode === "catalysts" || props.viewMode === "comps"
        ? props.viewMode
        : props.filter;
  const title = VIEW_TITLES[titleKey] ?? "研究总览";

  return (
    <header className="flex flex-col justify-between gap-4 border-b border-hairline pb-4 pt-1 xl:flex-row xl:items-end">
      <div className="space-y-2">
        <motion.h1
          key={titleKey}
          variants={KANON_TITLE_SWAP}
          initial="hidden"
          animate="visible"
          className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink-primary sm:text-[28px]"
        >
          {title}
        </motion.h1>
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
  const [inboxOpen, setInboxOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  return (
    <section className="space-y-4">
      <EditorialMasthead
        {...props}
        onOpenInbox={() => setInboxOpen(true)}
        onOpenLedger={() => setLedgerOpen(true)}
      />
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
      <CockpitWorkflowSheets
        inboxOpen={inboxOpen}
        ledgerOpen={ledgerOpen}
        onCloseInbox={() => setInboxOpen(false)}
        onCloseLedger={() => setLedgerOpen(false)}
      />
    </section>
  );
}
