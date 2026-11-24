"use client";

import type { PublicUser } from "@kanon/core";
import {
  ActionMenu,
  type ActionMenuItem,
  Button,
  KANON_TRANSITION_FAST,
  KanonMark,
  useTheme,
} from "@kanon/ui";
import {
  IconActivityHeartbeat,
  IconCompass,
  IconCpu,
  IconDots,
  IconDownload,
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
  guideOpen: boolean;
  onRefreshPrices: () => void;
  onOpenImport: () => void;
  onOpenStressTest: () => void;
  onToggleGuide: () => void;
  onOpenCommand: () => void;
  onOpenAiSettings: () => void;
  onNewThesis: () => void;
}

function BrandCluster() {
  return (
    <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap select-none">
      <KanonMark size={20} accent />
      <span className="text-sm font-semibold tracking-[0.22em] text-ink-primary">KANON</span>
    </div>
  );
}

function ThemeToggleButton() {
  const { theme, mounted, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "切换浅色模式" : "切换深色模式"}
      title={theme === "dark" ? "浅色模式" : "深色模式"}
      className="h-9 w-9 text-ink-secondary hover:text-ink-primary"
    >
      <motion.span
        key={mounted ? theme : "light"}
        initial={{ opacity: 0.4, rotate: -20, scale: 0.92 }}
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
      aria-label="搜索或指令"
      className="group inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-pill border border-hairline bg-surface/90 text-xs text-ink-secondary transition-[border-color,color,background-color] duration-150 hover:border-strong hover:text-ink-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-coral sm:w-auto sm:px-3"
    >
      <IconSearch size={14} stroke={1.5} className="text-ink-muted group-hover:text-ink-primary" />
      <span className="hidden sm:inline">搜索</span>
      <kbd className="hidden font-mono text-xs text-ink-muted tabular-nums sm:inline">⌘K</kbd>
    </button>
  );
}

function buildWorkspaceToolItems(props: CockpitTopbarProps): ActionMenuItem[] {
  return [
    {
      id: "refresh",
      label: props.refreshingPrices ? "校准收盘价中..." : "校准收盘参考价",
      icon: (
        <IconRefresh
          size={14}
          stroke={1.5}
          className={props.refreshingPrices ? "animate-spin text-accent-coral" : ""}
        />
      ),
      onSelect: props.onRefreshPrices,
    },
    {
      id: "stress",
      label: "组合压力测试",
      icon: <IconActivityHeartbeat size={14} stroke={1.5} />,
      onSelect: props.onOpenStressTest,
    },
    {
      id: "ai",
      label: props.hasByok ? "AI 引擎（已接入 BYOK）" : "配置 AI 引擎",
      shortcut: "A",
      icon: <IconCpu size={14} stroke={1.5} />,
      onSelect: props.onOpenAiSettings,
    },
    {
      id: "import",
      label: "导入 JSON 备份",
      icon: <IconUpload size={14} stroke={1.5} />,
      onSelect: props.onOpenImport,
    },
    {
      id: "export",
      label: "导出 CSV 台账",
      shortcut: "E",
      icon: <IconDownload size={14} stroke={1.5} />,
      onSelect: () => window.location.assign("/api/export/portfolio"),
    },
    {
      id: "guide",
      label: props.guideOpen ? "隐藏新手引导" : "显示新手引导",
      icon: <IconCompass size={14} stroke={1.5} />,
      onSelect: props.onToggleGuide,
    },
  ];
}

function TopbarActions(props: CockpitTopbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <SearchTriggerButton onOpenCommand={props.onOpenCommand} />
      <ActionMenu
        ariaLabel="工作台工具"
        items={buildWorkspaceToolItems(props)}
        triggerClassName="relative h-9 w-9 rounded-pill border-transparent bg-transparent px-0 hover:border-hairline hover:bg-muted/65"
        trigger={
          <>
            <IconDots size={16} stroke={1.5} />
            {props.hasByok ? (
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-pill bg-status-pass"
              />
            ) : null}
          </>
        }
      />
      <ThemeToggleButton />
      <Button
        variant="primary"
        size="md"
        onClick={props.onNewThesis}
        aria-label="新建标的"
        className="h-9 w-9 rounded-pill px-0 sm:w-auto sm:px-4"
      >
        <IconPlus size={15} stroke={1.5} />
        <span className="hidden sm:inline">新建标的</span>
      </Button>
      <AccountMenu currentUser={props.currentUser} />
    </div>
  );
}

export function CockpitTopbar(props: CockpitTopbarProps) {
  return (
    <header className="kanon-topbar-glass sticky top-0 z-30 border-b border-hairline">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:px-10">
        <BrandCluster />
        <TopbarActions {...props} />
      </div>
    </header>
  );
}
