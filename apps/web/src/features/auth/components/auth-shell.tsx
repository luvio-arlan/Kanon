"use client";

import { KANON_SPRING, KanonMark } from "@kanon/ui";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeOrbButton } from "@/shared/components/theme-orb-button";
import { AuthMonolithStage } from "./auth-monolith-stage";

const OFFICIAL_SITE_URL = "https://kanon.hk";

export interface AuthShellProps {
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

function AuthModeTabs({ mode }: { mode: "login" | "register" }) {
  const tabs = [
    { key: "login" as const, href: "/login", label: "登录" },
    { key: "register" as const, href: "/register", label: "注册" },
  ];

  return (
    <nav aria-label="账号模式" className="flex items-center gap-8 border-b border-hairline">
      {tabs.map((tab) => {
        const active = tab.key === mode;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            scroll={false}
            className={`relative pb-3 text-sm transition-colors duration-200 ${
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
          </Link>
        );
      })}
    </nav>
  );
}

export function AuthShell({ children }: AuthShellProps) {
  const pathname = usePathname();
  const mode = pathname === "/register" ? "register" : "login";

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-canvas lg:grid-cols-12">
      <AuthMonolithStage />
      <div className="flex flex-col justify-between lg:col-span-6">
        <AuthTopBar />
        <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-12">
          <div className="w-full max-w-[380px] space-y-8">
            <AuthModeTabs mode={mode} />
            <motion.div
              key={mode}
              initial={{ opacity: 0.4, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-8"
            >
              {children}
            </motion.div>
          </div>
        </main>
        <div aria-hidden="true" className="h-12" />
      </div>
    </div>
  );
}
