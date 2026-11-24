"use client";

import type { PublicUser } from "@kanon/core";
import { Button, KANON_TRANSITION_FAST, KanonMark, useTheme } from "@kanon/ui";
import { IconArrowUpRight, IconMoon, IconSun } from "@tabler/icons-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { OFFICIAL_SITE_URL } from "../data/landing-content";

interface LandingTopbarProps {
  currentUser: PublicUser | null;
  isDemo: boolean;
}

function ThemeButton() {
  const { theme, mounted, toggleTheme } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "切换至浅色模式" : "切换至深色模式"}
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

function LandingNavLinks() {
  return (
    <nav
      aria-label="产品导航"
      className="hidden items-center gap-6 text-sm text-ink-secondary md:flex"
    >
      <a href="#methodology" className="transition-colors hover:text-ink-primary">
        五步工作流
      </a>
      <a href="#committee" className="transition-colors hover:text-ink-primary">
        AI 投委会
      </a>
      <a href="#plans" className="transition-colors hover:text-ink-primary">
        方案与定价
      </a>
      <a
        href={OFFICIAL_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 transition-colors hover:text-ink-primary"
      >
        <span>品牌官网</span>
        <IconArrowUpRight size={14} stroke={1.5} />
      </a>
    </nav>
  );
}

export function LandingTopbar({ currentUser, isDemo }: LandingTopbarProps) {
  const isSignedInMember = Boolean(currentUser && !isDemo);
  return (
    <header className="kanon-topbar-glass sticky top-0 z-30 border-b border-hairline">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-10">
        <Link href="/welcome" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-surface shadow-card">
            <KanonMark size={17} />
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-[0.18em] text-ink-primary">KANON</span>
            <span aria-hidden="true" className="hidden h-3.5 w-px bg-strong sm:inline-block" />
            <span className="hidden text-sm font-medium text-ink-secondary sm:inline">卡农</span>
          </span>
        </Link>

        <LandingNavLinks />

        <div className="flex shrink-0 items-center gap-2">
          <ThemeButton />
          {isSignedInMember ? (
            <Link
              href="/"
              className="inline-flex h-9 items-center justify-center rounded-control bg-ink-primary px-4 text-sm font-medium text-ink-inverse shadow-button-primary transition-opacity hover:opacity-90"
            >
              进入我的工作台
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex h-9 items-center justify-center rounded-control border border-hairline bg-surface px-3.5 text-sm font-medium text-ink-primary shadow-button transition-colors hover:border-strong hover:bg-muted/70"
              >
                登录
              </Link>
              <Link
                href="/register"
                className="inline-flex h-9 items-center justify-center rounded-control bg-ink-primary px-4 text-sm font-medium text-ink-inverse shadow-button-primary transition-opacity hover:opacity-90"
              >
                免费注册
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
