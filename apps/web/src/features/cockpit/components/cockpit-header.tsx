"use client";

import type { PortfolioAnalytics, ThesisDetail } from "@kanon/core";
import { ActionMenu, Button, KANON_TITLE_SWAP, SearchField } from "@kanon/ui";
import { IconChevronDown, IconInbox, IconPlus } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { apiLoadInbox } from "../lib/inbox-ledger-api";
import { CockpitWorkflowSheets } from "./overlays/inbox-and-ledger-sheets";

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
  ledgerOpen: boolean;
  onCloseLedger: () => void;
  onSortChange: (next: CockpitSortBy) => void;
  onQueryChange: (next: string) => void;
  onNewThesis: () => void;
  onFocusBuyZone: () => void;
  onFocusWarnings: () => void;
  onOpenStressTest: () => void;
}

const SORT_OPTIONS: ReadonlyArray<{ id: CockpitSortBy; label: string }> = [
  { id: "index", label: "默认" },
  { id: "odds", label: "赔率" },
  { id: "cagr", label: "年化" },
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

function TelemetryLink({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={onClick} className={`cursor-pointer ${tone}`}>
        {label}
      </button>
    </>
  );
}

function SingleLineTelemetry({
  analytics,
  onFocusBuyZone,
  onFocusWarnings,
  onOpenStressTest,
}: {
  analytics: PortfolioAnalytics;
  onFocusBuyZone: () => void;
  onFocusWarnings: () => void;
  onOpenStressTest: () => void;
}) {
  const overCapCount = analytics.overCapTickers.length;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-ink-muted tabular-nums">
      <span>{analytics.activeCount} 跟踪</span>
      <TelemetryLink
        label={`${analytics.totalWeightPct.toFixed(0)}% 已配`}
        tone="transition-colors hover:text-ink-primary"
        onClick={onOpenStressTest}
      />
      {overCapCount > 0 ? (
        <TelemetryLink
          label={`${overCapCount} 超限`}
          tone="text-status-warn transition-opacity hover:opacity-80"
          onClick={onOpenStressTest}
        />
      ) : null}
      {analytics.inBuyZoneCount > 0 ? (
        <TelemetryLink
          label={`${analytics.inBuyZoneCount} 买点`}
          tone="text-status-pass transition-opacity hover:opacity-80"
          onClick={onFocusBuyZone}
        />
      ) : null}
      {analytics.warningThesisCount > 0 ? (
        <TelemetryLink
          label={`${analytics.warningThesisCount} 预警`}
          tone="text-status-fail transition-opacity hover:opacity-80"
          onClick={onFocusWarnings}
        />
      ) : null}
    </div>
  );
}

function SortCompactDropdown({
  sortBy,
  onSortChange,
}: {
  sortBy: CockpitSortBy;
  onSortChange: (next: CockpitSortBy) => void;
}) {
  const activeLabel = SORT_OPTIONS.find((opt) => opt.id === sortBy)?.label ?? "默认";
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
      triggerClassName="h-10 rounded-l-none border-l-0 px-2.5 text-xs text-ink-secondary"
      trigger={
        <>
          <span>{activeLabel}</span>
          <IconChevronDown size={13} stroke={1.5} className="kanon-chevron text-ink-muted" />
        </>
      }
    />
  );
}

function MastheadActions(
  props: CockpitHeaderProps & { unreadCount: number; onOpenInbox: () => void },
) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center">
        <SearchField
          value={props.query}
          onChange={props.onQueryChange}
          inputRef={props.searchInputRef}
          placeholder="筛选代码或公司 ( / )"
          ariaLabel="筛选标的"
          className={props.viewMode === "cards" ? "w-44 sm:w-48" : "w-full sm:w-52"}
        />
        {props.viewMode === "cards" ? (
          <SortCompactDropdown sortBy={props.sortBy} onSortChange={props.onSortChange} />
        ) : null}
      </div>
      <Button
        variant="outline"
        size="md"
        aria-label={
          props.unreadCount > 0 ? `研究收件箱（${props.unreadCount} 条未读）` : "研究收件箱"
        }
        onClick={props.onOpenInbox}
        className="relative px-2.5"
      >
        <IconInbox size={16} stroke={1.5} />
        {props.unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-pill bg-accent-coral"
          />
        ) : null}
      </Button>
      <Button variant="primary" size="md" onClick={props.onNewThesis}>
        <IconPlus size={16} stroke={1.5} />
        <span>新建标的</span>
      </Button>
    </div>
  );
}

function resolveHeaderTitleKey(viewMode: CockpitViewMode, filter: CockpitFilter): string {
  if (viewMode === "table") return "matrix";
  if (viewMode === "catalysts" || viewMode === "comps") return viewMode;
  return filter;
}

export function CockpitHeader(props: CockpitHeaderProps) {
  const [inboxOpen, setInboxOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const refreshUnread = useCallback(() => {
    void apiLoadInbox().then((d) => setUnreadCount(d.items.filter((i) => !i.readAt).length));
  }, []);
  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  const titleKey = resolveHeaderTitleKey(props.viewMode, props.filter);
  const title = VIEW_TITLES[titleKey] ?? "研究总览";
  return (
    <section>
      <header className="flex flex-col justify-between gap-4 border-b border-hairline pb-4 pt-1 xl:flex-row xl:items-end">
        <div className="space-y-1.5">
          <motion.h1
            key={titleKey}
            variants={KANON_TITLE_SWAP}
            initial="hidden"
            animate="visible"
            className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink-primary sm:text-[28px]"
          >
            {title}
          </motion.h1>
          <SingleLineTelemetry
            analytics={props.analytics}
            onFocusBuyZone={props.onFocusBuyZone}
            onFocusWarnings={props.onFocusWarnings}
            onOpenStressTest={props.onOpenStressTest}
          />
        </div>
        <MastheadActions
          {...props}
          unreadCount={unreadCount}
          onOpenInbox={() => setInboxOpen(true)}
        />
      </header>
      <CockpitWorkflowSheets
        inboxOpen={inboxOpen}
        ledgerOpen={props.ledgerOpen}
        onCloseInbox={() => {
          setInboxOpen(false);
          refreshUnread();
        }}
        onCloseLedger={props.onCloseLedger}
      />
    </section>
  );
}
