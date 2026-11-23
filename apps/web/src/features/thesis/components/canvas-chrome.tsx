"use client";

import type { ThesisDetail } from "@kanon/core";
import { ActionMenu, type ActionMenuItem, KanonMark, RollingNumber, useTheme } from "@kanon/ui";
import {
  IconArrowLeft,
  IconChevronDown,
  IconCpu,
  IconDots,
  IconDownload,
  IconFocus2,
  IconMoon,
  IconSearch,
  IconSun,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";

export { type StepId, StepRail } from "./step-rail";

interface TopbarMenuProps {
  thesisId: string;
  hasByok: boolean;
  focusMode: boolean;
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

function TopbarBreadcrumb({ thesis }: { thesis: ThesisDetail }) {
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
      <span className="truncate font-semibold text-ink-primary">{thesis.companyName}</span>
      <span className="font-mono text-xs text-ink-muted">{thesis.ticker}</span>
      <span className="hidden items-center gap-1.5 pl-2 font-mono text-xs text-ink-muted tabular-nums md:inline-flex">
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
  hasByok: boolean;
  focusMode: boolean;
  onOpenCommand: () => void;
  onOpenAiSettings: () => void;
  onToggleFocus: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <header className="kanon-topbar-glass sticky top-0 z-30 border-b border-hairline">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6 sm:px-10">
        <TopbarBreadcrumb thesis={props.thesis} />
        <TopbarMenus
          thesisId={props.thesis.id}
          hasByok={props.hasByok}
          focusMode={props.focusMode}
          onOpenCommand={props.onOpenCommand}
          onOpenAiSettings={props.onOpenAiSettings}
          onToggleFocus={props.onToggleFocus}
          onRequestDelete={props.onRequestDelete}
        />
      </div>
    </header>
  );
}
