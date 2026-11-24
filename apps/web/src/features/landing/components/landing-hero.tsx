"use client";

import { Badge, KANON_FADE_UP_ITEM, KANON_STAGGER_CONTAINER } from "@kanon/ui";
import {
  IconArrowRight,
  IconArrowUpRight,
  IconCheck,
  IconLock,
  IconPlayerPlay,
  IconShieldCheck,
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { OFFICIAL_SITE_URL } from "../data/landing-content";
import { LandingSpecimenCard } from "./landing-specimen-card";

function HeroActions() {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <Link
        href="/register"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-ink-primary px-5 text-sm font-medium text-ink-inverse shadow-button-primary transition-opacity hover:opacity-90"
      >
        <span>+86 手机号免费注册</span>
        <IconArrowRight size={15} stroke={1.5} />
      </Link>
      <Link
        href="/demo"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-hairline bg-surface px-5 text-sm font-medium text-ink-primary shadow-button transition-colors hover:border-strong hover:bg-muted/70"
      >
        <IconPlayerPlay size={14} stroke={1.5} className="text-accent-coral" />
        <span>免注册 · 沙盒体验</span>
      </Link>
      <a
        href={OFFICIAL_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 items-center gap-1.5 px-2 text-sm text-ink-secondary transition-colors hover:text-ink-primary"
      >
        <span>访问品牌官网 kanon.hk</span>
        <IconArrowUpRight size={15} stroke={1.5} />
      </a>
    </div>
  );
}

function HeroTrustStrip() {
  return (
    <div className="grid grid-cols-1 gap-3 border-t border-hairline pt-6 sm:grid-cols-3">
      <div className="flex items-center gap-2 text-xs text-ink-secondary">
        <IconLock size={15} stroke={1.5} className="shrink-0 text-ink-primary" />
        <span>账号级数据严格隔离</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-secondary">
        <IconShieldCheck size={15} stroke={1.5} className="shrink-0 text-status-pass" />
        <span>注册即赠 NVDA/MU 模板</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-secondary">
        <IconCheck size={15} stroke={1.5} className="shrink-0 text-accent-coral" />
        <span>全量 Markdown / JSON 导出</span>
      </div>
    </div>
  );
}

export function LandingHero() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-10 sm:pt-20">
      <motion.div
        variants={KANON_STAGGER_CONTAINER}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12"
      >
        <motion.div variants={KANON_FADE_UP_ITEM} className="space-y-7 lg:col-span-7">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant="titanium">KANON OS · 独立账号版</Badge>
            <span className="font-mono text-xs text-ink-muted">Conviction, composed.</span>
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold leading-[1.12] tracking-tight text-ink-primary sm:text-5xl">
              在噪音里，
              <br />
              谱出自己的
              <span className="text-accent-coral">确定性</span>。
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-ink-secondary sm:text-lg">
              面向深度个人价值投资者与买方投研团队的投资逻辑操作系统。用独立云端账号沉淀你的每一份研究假设、SEC
              财报审计、三情景估值赔率与零杠杆交易纪律。
            </p>
          </div>
          <HeroActions />
          <HeroTrustStrip />
        </motion.div>

        <motion.div variants={KANON_FADE_UP_ITEM} className="lg:col-span-5">
          <LandingSpecimenCard />
        </motion.div>
      </motion.div>
    </section>
  );
}
