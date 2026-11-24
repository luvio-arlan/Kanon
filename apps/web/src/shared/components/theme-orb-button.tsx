"use client";

import { useTheme } from "@kanon/ui";

export interface ThemeOrbButtonProps {
  className?: string;
}

export function ThemeOrbButton({ className = "" }: ThemeOrbButtonProps) {
  const { theme, mounted, toggleTheme } = useTheme();
  const isDark = mounted && theme === "dark";

  return (
    <button
      type="button"
      onClick={(e) => toggleTheme({ x: e.clientX, y: e.clientY })}
      aria-label={isDark ? "切换至浅色模式" : "切换至深色模式"}
      className={`group inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-pill border border-strong text-ink-secondary transition-[border-color,color,transform] duration-300 hover:border-ink-primary hover:text-ink-primary ${className}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className={`transition-transform duration-500 group-hover:rotate-180 ${isDark ? "rotate-180" : "rotate-0"}`}
      >
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.35" />
        <path d="M8 2a6 6 0 0 1 0 12V2Z" fill="currentColor" />
      </svg>
    </button>
  );
}
