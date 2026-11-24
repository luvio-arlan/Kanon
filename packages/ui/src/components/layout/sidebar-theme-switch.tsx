"use client";

import { IconMoon, IconSun } from "@tabler/icons-react";
import { motion } from "framer-motion";
import type { MouseEvent } from "react";
import { cn } from "../../lib/cn";
import { KANON_TAB_TRANSITION } from "../../lib/motion";
import { type ThemeMode, useTheme } from "../primitives/theme-provider";

export interface SidebarThemeSwitchProps {
  collapsed?: boolean;
  className?: string;
}

const MODES: ReadonlyArray<{ id: ThemeMode; label: string }> = [
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
];

function CollapsedThemeButton({
  active,
  onToggle,
  className,
}: {
  active: ThemeMode;
  onToggle: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  const label = active === "dark" ? "切换浅色模式" : "切换深色模式";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-10 w-10 cursor-pointer items-center justify-center rounded-control border border-hairline bg-surface text-ink-secondary shadow-button transition-colors hover:border-strong hover:text-ink-primary",
        className,
      )}
    >
      {active === "dark" ? <IconSun size={17} stroke={1.5} /> : <IconMoon size={17} stroke={1.5} />}
    </button>
  );
}

function ThemeModeOption({
  mode,
  label,
  selected,
  onClick,
}: {
  mode: ThemeMode;
  label: string;
  selected: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-badge text-xs font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-coral",
        selected ? "text-ink-primary" : "text-ink-muted hover:text-ink-primary",
      )}
    >
      {selected ? (
        <motion.span
          layoutId="sidebar-theme-pill"
          transition={KANON_TAB_TRANSITION}
          style={{ borderRadius: 6 }}
          className="pointer-events-none absolute inset-0 rounded-badge border border-strong/75 bg-surface-elevated shadow-pill-active"
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center gap-1.5">
        {mode === "light" ? (
          <IconSun size={14} stroke={1.5} />
        ) : (
          <IconMoon size={14} stroke={1.5} />
        )}
        <span>{label}</span>
      </span>
    </button>
  );
}

export function SidebarThemeSwitch({ collapsed = false, className }: SidebarThemeSwitchProps) {
  const { theme, mounted, toggleTheme } = useTheme();
  const active: ThemeMode = mounted ? theme : "light";

  if (collapsed) {
    return (
      <CollapsedThemeButton
        active={active}
        onToggle={(e) => toggleTheme({ x: e.clientX, y: e.clientY })}
        className={className}
      />
    );
  }

  return (
    <fieldset
      aria-label="外观主题"
      className={cn(
        "m-0 grid grid-cols-2 gap-1 rounded-control border border-hairline bg-canvas p-1",
        className,
      )}
    >
      {MODES.map((m) => (
        <ThemeModeOption
          key={m.id}
          mode={m.id}
          label={m.label}
          selected={active === m.id}
          onClick={(e) => {
            if (m.id !== active) toggleTheme({ x: e.clientX, y: e.clientY });
          }}
        />
      ))}
    </fieldset>
  );
}
