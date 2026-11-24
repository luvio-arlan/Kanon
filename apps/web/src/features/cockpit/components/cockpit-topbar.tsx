"use client";

import type { PublicUser } from "@kanon/core";
import { Button, KANON_TRANSITION_FAST, KanonMark, useTheme } from "@kanon/ui";
import {
  IconCpu,
  IconMoon,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSun,
  IconUpload,
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import { AccountMenu } from "@/features/auth";

export interface CockpitTopbarProps {
  currentUser: PublicUser;
  hasByok: boolean;
  refreshingPrices: boolean;
  onRefreshPrices: () => void;
  onOpenImport: () => void;
  onOpenCommand: () => void;
  onOpenAiSettings: () => void;
  onNewThesis: () => void;
}

function BrandCluster() {
  return (
    <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-hairline bg-surface shadow-card">
        <KanonMark size={17} />
      </span>
      <div className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-sm font-semibold tracking-[0.18em] text-ink-primary">KANON</span>
        <span aria-hidden="true" className="hidden h-3.5 w-px bg-strong sm:inline-block" />
        <span className="hidden text-sm font-medium text-ink-secondary sm:inline">卡农</span>
      </div>
    </div>
  );
}

function ThemeToggleButton() {
  const { theme, mounted, toggleTheme } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "切换至浅色模式" : "切换至深色模式"}
      title={theme === "dark" ? "暖白纸面" : "暗夜黑曜石"}
      className="h-9 w-9"
    >
      <motion.span
        key={mounted ? theme : "light"}
        initial={{ opacity: 0.4, rotate: -25, scale: 0.9 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        transition={KANON_TRANSITION_FAST}
        className="flex items-center justify-center"
      >
        {mounted && theme === "dark" ? (
          <IconSun size={16} stroke={1.5} />
        ) : (
          <IconMoon size={16} stroke={1.5} />
        )}
      </motion.span>
    </Button>
  );
}

function SearchTriggerButton({ onOpenCommand }: { onOpenCommand: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenCommand}
      aria-label="搜索或打开指令面板"
      className="group inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center gap-2.5 rounded-control border border-hairline bg-surface text-sm text-ink-secondary shadow-button transition-[transform,border-color,color,background-color] duration-150 hover:border-strong hover:bg-muted/50 hover:text-ink-primary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral sm:w-auto sm:px-3"
    >
      <IconSearch size={15} stroke={1.5} className="text-ink-muted group-hover:text-ink-primary" />
      <span className="hidden sm:inline">搜索或指令</span>
      <kbd className="hidden rounded border border-hairline bg-muted/80 px-1.5 py-0.5 font-mono text-xs leading-none text-ink-muted tabular-nums sm:inline">
        ⌘K
      </kbd>
    </button>
  );
}

function UtilityActionButtons(props: {
  hasByok: boolean;
  refreshingPrices: boolean;
  onRefreshPrices: () => void;
  onOpenAiSettings: () => void;
}) {
  return (
    <>
      <Button
        variant="outline"
        size="md"
        disabled={props.refreshingPrices}
        onClick={props.onRefreshPrices}
        aria-label="校准收盘价"
        title="按需校准全仓最新收盘参考价（非实时盯盘）"
        className="w-9 px-0 lg:w-auto lg:px-3.5"
      >
        <IconRefresh
          size={15}
          stroke={1.5}
          className={props.refreshingPrices ? "animate-spin text-accent-coral" : ""}
        />
        <span className="hidden lg:inline">
          {props.refreshingPrices ? "校准中..." : "校准收盘价"}
        </span>
      </Button>
      <Button
        variant="outline"
        size="md"
        onClick={props.onOpenAiSettings}
        aria-label="配置大模型引擎"
        title="配置大模型引擎"
        className="w-9 px-0 md:w-auto md:px-3.5"
      >
        <span
          className={`hidden h-1.5 w-1.5 rounded-pill md:inline-block ${props.hasByok ? "bg-status-pass" : "bg-ink-muted"}`}
        />
        <IconCpu size={15} stroke={1.5} />
        <span className="hidden md:inline">{props.hasByok ? "BYOK" : "AI 引擎"}</span>
      </Button>
    </>
  );
}

function TopbarActions(props: CockpitTopbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <SearchTriggerButton onOpenCommand={props.onOpenCommand} />
      <UtilityActionButtons
        hasByok={props.hasByok}
        refreshingPrices={props.refreshingPrices}
        onRefreshPrices={props.onRefreshPrices}
        onOpenAiSettings={props.onOpenAiSettings}
      />
      <span aria-hidden="true" className="mx-0.5 hidden h-4 w-px bg-hairline sm:inline-block" />
      <Button
        variant="primary"
        size="md"
        onClick={props.onNewThesis}
        aria-label="新建标的"
        className="w-9 px-0 sm:w-auto sm:px-3.5"
      >
        <IconPlus size={15} stroke={1.5} />
        <span className="hidden sm:inline">新建标的</span>
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={props.onOpenImport}
        aria-label="导入 JSON 研究备份"
        title="导入 JSON 研究备份"
        className="hidden h-9 w-9 sm:inline-flex"
      >
        <IconUpload size={15} stroke={1.5} />
      </Button>
      <ThemeToggleButton />
      <AccountMenu currentUser={props.currentUser} />
    </div>
  );
}

export function CockpitTopbar(props: CockpitTopbarProps) {
  return (
    <header className="kanon-topbar-glass sticky top-0 z-30 border-b border-hairline">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-10">
        <BrandCluster />
        <TopbarActions {...props} />
      </div>
    </header>
  );
}
