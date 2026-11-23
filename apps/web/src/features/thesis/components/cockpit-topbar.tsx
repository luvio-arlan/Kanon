"use client";

import { Button, KANON_TRANSITION_FAST, KanonMark, useTheme } from "@kanon/ui";
import { IconMoon, IconPlus, IconSearch, IconSun } from "@tabler/icons-react";
import { motion } from "framer-motion";

export interface CockpitTopbarProps {
  onOpenCommand: () => void;
  onNewThesis: () => void;
}

function BrandCluster() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-surface shadow-card">
        <KanonMark size={17} />
      </span>
      <div className="flex items-baseline gap-2.5">
        <span className="text-sm font-semibold tracking-[0.18em] text-ink-primary">KANON</span>
        <span aria-hidden="true" className="h-3.5 w-px bg-strong" />
        <span className="text-sm font-medium text-ink-secondary">卡农</span>
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

export function CockpitTopbar({ onOpenCommand, onNewThesis }: CockpitTopbarProps) {
  return (
    <header className="kanon-topbar-glass sticky top-0 z-30 border-b border-hairline">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6 sm:px-10">
        <BrandCluster />

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenCommand}
            className="group flex h-9 cursor-pointer items-center gap-3 rounded-control border border-hairline bg-surface px-3.5 text-sm text-ink-secondary shadow-card transition-all duration-150 hover:border-strong hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral"
          >
            <IconSearch
              size={15}
              stroke={1.5}
              className="text-ink-muted group-hover:text-ink-primary"
            />
            <span className="hidden sm:inline">搜索或指令</span>
            <kbd className="rounded border border-hairline bg-muted px-1.5 py-0.5 font-mono text-xs text-ink-muted tabular-nums">
              ⌘K
            </kbd>
          </button>

          <Button variant="primary" size="md" onClick={onNewThesis}>
            <IconPlus size={15} stroke={1.5} />
            <span className="hidden sm:inline">新建标的</span>
          </Button>

          <ThemeToggleButton />
        </div>
      </div>
    </header>
  );
}
