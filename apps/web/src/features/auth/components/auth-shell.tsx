"use client";

import { KANON_SPRING, KanonMark } from "@kanon/ui";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { ThemeOrbButton } from "@/shared/components/theme-orb-button";
import { AuthMonolithStage } from "./auth-monolith-stage";

const OFFICIAL_SITE_URL = "https://kanon.hk";

export type AuthMode = "login" | "register";

export interface AuthShellProps {
  mode: AuthMode;
  onModeChange: (next: AuthMode) => void;
  children: ReactNode;
}

function AuthTopBar() {
  return (
    <header className="flex h-20 items-center justify-between px-6 sm:px-12 lg:justify-end">
      <a
        href={OFFICIAL_SITE_URL}
        aria-label="返回 KANON 官网"
        title="返回 KANON 官网"
        className="inline-flex items-center gap-3 text-ink-primary transition-opacity hover:opacity-75 lg:hidden"
      >
        <KanonMark size={22} accent />
        <span className="text-sm font-medium tracking-[0.24em]">KANON</span>
      </a>
      <div className="flex items-center gap-3">
        <ThemeOrbButton />
      </div>
    </header>
  );
}

function AuthModeTabs({
  mode,
  onModeChange,
}: {
  mode: AuthMode;
  onModeChange: (next: AuthMode) => void;
}) {
  const tabs: { key: AuthMode; label: string }[] = [
    { key: "login", label: "登录" },
    { key: "register", label: "注册" },
  ];

  return (
    <div
      role="tablist"
      aria-label="账号模式"
      className="flex items-center gap-8 border-b border-hairline"
    >
      {tabs.map((tab) => {
        const active = tab.key === mode;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onModeChange(tab.key)}
            className={`relative cursor-pointer pb-3 text-sm transition-colors duration-200 ${
              active ? "font-medium text-ink-primary" : "text-ink-muted hover:text-ink-primary"
            }`}
          >
            {tab.label}
            {active ? (
              <motion.span
                layoutId="auth-mode-inkbar"
                transition={KANON_SPRING}
                className="absolute inset-x-0 -bottom-px h-[1.5px] bg-accent-coral"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function AuthShell({ mode, onModeChange, children }: AuthShellProps) {
  return (
    <div className="grid min-h-dvh grid-cols-1 bg-canvas lg:grid-cols-12">
      <AuthMonolithStage />
      <div className="flex flex-col lg:col-span-6">
        <AuthTopBar />
        <main className="flex flex-1 items-start justify-center px-6 pb-12 pt-[clamp(24px,9vh,88px)] sm:px-12">
          <div className="w-full max-w-[380px]">
            <AuthModeTabs mode={mode} onModeChange={onModeChange} />
            <div className="relative mt-8 overflow-x-clip">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
