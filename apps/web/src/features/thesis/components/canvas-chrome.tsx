"use client";

import type { ThesisDetail, ThesisSummary } from "@kanon/core";
import { ActionMenu, type ActionMenuItem, KanonMark, RollingNumber, useTheme } from "@kanon/ui";
import {
  IconArrowLeft,
  IconChevronDown,
  IconCode,
  IconCpu,
  IconDots,
  IconDownload,
  IconFocus2,
  IconMoon,
  IconSearch,
  IconSparkles,
  IconSun,
  IconTrash,
  IconTrendingUp,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export { type StepId, StepRail } from "./step-rail";

interface TopbarMenuProps {
  thesisId: string;
  hasByok: boolean;
  focusMode: boolean;
  onOpenAgent: () => void;
  onOpenCommand: () => void;
  onOpenAiSettings: () => void;
  onToggleFocus: () => void;
  onRequestDelete: () => void;
}

function buildExportItems(thesisId: string): ActionMenuItem[] {
  return [
    {
      id: "md",
      label: "导出 Markdown 档案",
      icon: <IconDownload size={14} stroke={1.5} />,
      onSelect: () => window.location.assign(`/api/export/thesis/${thesisId}?format=md`),
    },
    {
      id: "gdoc",
      label: "导出 Google Doc 排版",
      icon: <IconDownload size={14} stroke={1.5} />,
      onSelect: () => window.location.assign(`/api/export/thesis/${thesisId}?format=gdoc`),
    },
    {
      id: "json",
      label: "导出全量 JSON 备份",
      icon: <IconCode size={14} stroke={1.5} />,
      onSelect: () => window.location.assign(`/api/export/thesis/${thesisId}?format=json`),
    },
  ];
}

function buildMoreItems(
  p: TopbarMenuProps,
  theme: "light" | "dark",
  toggleTheme: () => void,
): ActionMenuItem[] {
  return [
    {
      id: "focus",
      label: p.focusMode ? "退出专注阅读模式" : "进入专注阅读模式",
      shortcut: "F",
      icon: <IconFocus2 size={14} stroke={1.5} />,
      onSelect: p.onToggleFocus,
    },
    {
      id: "ai",
      label: p.hasByok ? "AI 引擎（已连 BYOK）" : "配置 AI 引擎（BYOK）",
      shortcut: "A",
      icon: <IconCpu size={14} stroke={1.5} />,
      onSelect: p.onOpenAiSettings,
    },
    {
      id: "theme",
      label: theme === "dark" ? "切换暖白纸面" : "切换暗夜黑曜石",
      shortcut: "T",
      icon:
        theme === "dark" ? <IconSun size={14} stroke={1.5} /> : <IconMoon size={14} stroke={1.5} />,
      onSelect: toggleTheme,
    },
    {
      id: "delete",
      label: "删除此标的档案",
      tone: "danger",
      icon: <IconTrash size={14} stroke={1.5} />,
      onSelect: p.onRequestDelete,
    },
  ];
}

function TopbarMenus(props: TopbarMenuProps) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={props.onOpenAgent}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border border-accent-coral/35 bg-accent-coral-soft px-2.5 text-xs font-medium text-accent-coral transition-all duration-150 hover:border-accent-coral/70 active:scale-[0.97]"
      >
        <IconSparkles size={14} stroke={1.5} />
        <span className="hidden sm:inline">投研 Agent</span>
        <kbd className="hidden font-mono text-xs opacity-75 md:inline">⌘J</kbd>
      </button>
      <button
        type="button"
        onClick={props.onOpenCommand}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border border-hairline bg-surface px-2.5 text-xs text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary"
      >
        <IconSearch size={14} stroke={1.5} />
        <kbd className="font-mono text-xs text-ink-muted">⌘K</kbd>
      </button>
      <ActionMenu
        ariaLabel="导出研究档案"
        items={buildExportItems(props.thesisId)}
        trigger={
          <>
            <span>导出</span>
            <IconChevronDown size={13} stroke={1.5} />
          </>
        }
      />
      <ActionMenu
        ariaLabel="更多画布设置"
        items={buildMoreItems(props, theme, toggleTheme)}
        triggerClassName="w-8 px-0"
        trigger={<IconDots size={15} stroke={1.5} />}
      />
    </div>
  );
}

function buildSwitcherItems(
  currentId: string,
  allTheses: readonly ThesisSummary[],
  push: (href: string) => void,
): ActionMenuItem[] {
  return allTheses.map((item) => ({
    id: item.id,
    label: `${item.companyName} (${item.ticker})`,
    shortcut: item.riskRewardRatio !== null ? `${item.riskRewardRatio.toFixed(1)}×` : "∞",
    icon: <IconTrendingUp size={14} stroke={1.5} />,
    onSelect: () => {
      if (item.id !== currentId) push(`/thesis/${item.id}`);
    },
  }));
}

function TopbarBreadcrumb({
  thesis,
  allTheses,
}: {
  thesis: ThesisDetail;
  allTheses: readonly ThesisSummary[];
}) {
  const router = useRouter();
  const ratio = thesis.valuation.riskRewardRatio;
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-sm">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted transition-colors hover:text-ink-primary"
      >
        <IconArrowLeft size={14} stroke={1.5} />
        <span className="hidden sm:inline">驾驶舱</span>
      </Link>
      <span aria-hidden="true" className="text-ink-muted/60">
        /
      </span>
      <KanonMark size={15} className="hidden shrink-0 sm:block" />
      <ActionMenu
        ariaLabel="快速切换标的"
        items={buildSwitcherItems(thesis.id, allTheses, router.push)}
        triggerClassName="border-transparent bg-transparent px-1.5 hover:bg-muted/70"
        trigger={
          <span className="inline-flex items-center gap-1.5">
            <span className="truncate font-semibold text-ink-primary">{thesis.companyName}</span>
            <span className="font-mono text-xs text-ink-muted">{thesis.ticker}</span>
            <IconChevronDown size={13} stroke={1.5} className="text-ink-muted" />
          </span>
        }
      />
      <span className="hidden items-center gap-1.5 pl-1 font-mono text-xs text-ink-muted tabular-nums md:inline-flex">
        <span>·</span>
        <span>中性</span>
        <RollingNumber
          value={thesis.valuation.base.targetPrice}
          prefix="$"
          decimals={1}
          className="font-medium text-ink-primary"
        />
        {ratio !== null ? <span className="text-ink-secondary">({ratio.toFixed(2)}×)</span> : null}
      </span>
    </div>
  );
}

export function CanvasTopbar(props: {
  thesis: ThesisDetail;
  allTheses: readonly ThesisSummary[];
  hasByok: boolean;
  focusMode: boolean;
  onOpenAgent: () => void;
  onOpenCommand: () => void;
  onOpenAiSettings: () => void;
  onToggleFocus: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <header className="no-print kanon-topbar-glass sticky top-0 z-30 border-b border-hairline">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6 sm:px-10">
        <TopbarBreadcrumb thesis={props.thesis} allTheses={props.allTheses} />
        <TopbarMenus
          thesisId={props.thesis.id}
          hasByok={props.hasByok}
          focusMode={props.focusMode}
          onOpenAgent={props.onOpenAgent}
          onOpenCommand={props.onOpenCommand}
          onOpenAiSettings={props.onOpenAiSettings}
          onToggleFocus={props.onToggleFocus}
          onRequestDelete={props.onRequestDelete}
        />
      </div>
    </header>
  );
}
