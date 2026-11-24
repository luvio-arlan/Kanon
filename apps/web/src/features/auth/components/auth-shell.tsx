"use client";

import { Badge, Button, KANON_TRANSITION_FAST, KanonMark, useTheme } from "@kanon/ui";
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconMoon,
  IconShieldCheck,
  IconSun,
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import Link from "next/link";
import type { ReactNode } from "react";

const OFFICIAL_SITE_URL = "https://kanon.hk";

const EDITORIAL_PILLARS = [
  {
    idx: "01",
    title: "独立账号云端隔离",
    desc: "每位投资者的研究档案、假设与复盘记录严格独立存储。",
  },
  {
    idx: "02",
    title: "SEC 一手财报审计",
    desc: "穿透 10-K/10-Q 原始 XBRL 数据，自动核验真实自由现金流。",
  },
  {
    idx: "03",
    title: "三情景赔率与 5×5 矩阵",
    desc: "把直觉变成可量化的安全边际、隐含 CAGR 与敏感性推演。",
  },
  {
    idx: "04",
    title: "零杠杆纪律硬约束",
    desc: "代码级守卫零杠杆与仓位上限，过滤情绪化追涨杀跌。",
  },
] as const;

export interface AuthShellProps {
  mode: "login" | "register";
  title: string;
  subtitle: string;
  children: ReactNode;
}

function ThemeSwitchBtn() {
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

function EditorialPillarList() {
  return (
    <div className="divide-y divide-hairline rounded-card border border-hairline bg-surface/90 shadow-card">
      {EDITORIAL_PILLARS.map((item) => (
        <div key={item.idx} className="flex items-start gap-3.5 p-4">
          <span className="font-mono text-xs font-semibold text-accent-coral">{item.idx}</span>
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-ink-primary">{item.title}</div>
            <p className="text-xs leading-relaxed text-ink-secondary">{item.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AuthEditorialRail() {
  return (
    <aside className="hidden flex-col justify-between border-r border-hairline bg-titanium-subtle/85 p-10 lg:col-span-5 lg:flex xl:p-14">
      <div className="flex items-center justify-between">
        <Link href="/welcome" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-control border border-hairline bg-surface shadow-card">
            <KanonMark size={18} />
          </span>
          <span className="text-sm font-semibold tracking-[0.2em] text-ink-primary">KANON</span>
        </Link>
        <a
          href={OFFICIAL_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-xs text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <span>kanon.hk</span>
          <IconArrowUpRight size={13} stroke={1.5} />
        </a>
      </div>

      <div className="space-y-7">
        <div className="space-y-3">
          <Badge variant="pass">
            <IconShieldCheck size={13} stroke={1.5} />
            独立加密账户空间
          </Badge>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-ink-primary">
            在噪音里，
            <br />
            谱出自己的<span className="text-accent-coral">确定性</span>。
          </h2>
          <p className="text-sm leading-relaxed text-ink-secondary">
            Conviction, composed. — 面向长期主义者的美股投资逻辑操作系统。
          </p>
        </div>
        <EditorialPillarList />
      </div>

      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span className="font-mono">KANON OS · +86 ACCOUNT</span>
        <span>零杠杆 · 长周期 · 自主掌控数据</span>
      </div>
    </aside>
  );
}

function AuthTopBar() {
  return (
    <header className="flex h-16 items-center justify-between px-5 sm:px-10">
      <Link
        href="/welcome"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary transition-colors hover:text-ink-primary"
      >
        <IconArrowLeft size={14} stroke={1.5} />
        <span>返回产品首页</span>
      </Link>
      <div className="flex items-center gap-2.5">
        <a
          href={OFFICIAL_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <span>品牌官网 kanon.hk</span>
          <IconArrowUpRight size={13} stroke={1.5} />
        </a>
        <ThemeSwitchBtn />
      </div>
    </header>
  );
}

function AuthModeSwitcher({ mode }: { mode: "login" | "register" }) {
  return (
    <div className="grid grid-cols-2 rounded-control border border-hairline bg-muted/80 p-1">
      <Link
        href="/login"
        className={`flex h-9 items-center justify-center rounded-control text-sm font-medium transition-all ${
          mode === "login"
            ? "bg-surface text-ink-primary shadow-pill-active"
            : "text-ink-secondary hover:text-ink-primary"
        }`}
      >
        登录工作台
      </Link>
      <Link
        href="/register"
        className={`flex h-9 items-center justify-center rounded-control text-sm font-medium transition-all ${
          mode === "register"
            ? "bg-surface text-ink-primary shadow-pill-active"
            : "text-ink-secondary hover:text-ink-primary"
        }`}
      >
        注册新账号
      </Link>
    </div>
  );
}

export function AuthShell({ mode, title, subtitle, children }: AuthShellProps) {
  return (
    <div className="kanon-ambient-canvas grid min-h-dvh grid-cols-1 lg:grid-cols-12">
      <AuthEditorialRail />
      <div className="flex flex-col lg:col-span-7">
        <AuthTopBar />
        <main className="flex flex-1 items-center justify-center px-5 pb-12 pt-4 sm:px-10">
          <div className="w-full max-w-[440px] space-y-6 rounded-card border border-hairline bg-surface p-6 shadow-card-hover sm:p-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2 lg:hidden">
                <KanonMark size={18} />
                <span className="text-xs font-semibold tracking-[0.2em] text-ink-primary">
                  KANON 卡农
                </span>
              </div>
              <AuthModeSwitcher mode={mode} />
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">{title}</h1>
                <p className="text-sm text-ink-secondary">{subtitle}</p>
              </div>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
