"use client";

import { Badge } from "@kanon/ui";
import {
  IconArrowRight,
  IconArrowUpRight,
  IconCheck,
  IconShieldLock,
  IconSparkles,
} from "@tabler/icons-react";
import Link from "next/link";
import {
  COMMERCIAL_TIERS,
  type CommercialTier,
  IC_PERSONAS,
  OFFICIAL_SITE_URL,
} from "../data/landing-content";

function CommitteeShowcase() {
  return (
    <section id="committee" className="mx-auto max-w-6xl px-5 py-20 sm:px-10">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <Badge variant="coral">
            <IconSparkles size={13} stroke={1.5} />
            02 / POLYPHONY IC AGENT
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            四位立场独立的 AI 投委会委员，替你做最严苛的红队压力测试
          </h2>
          <p className="text-sm leading-relaxed text-ink-secondary">
            KANON 投研 Agent
            同时启动多头、红队空头、法务会计与主席四个角色，所有提案经你人工审阅后才写入画布。
          </p>
          <div className="rounded-control border border-hairline bg-surface p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-ink-primary">
              <IconShieldLock size={15} stroke={1.5} className="text-status-pass" />
              <span>零杠杆铁律（Zero-Leverage Iron Rule）</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
              任何非观望类交易纪律卡均由后端与数据库双重校验，未确认零杠杆与仓位上限前系统强制拦截。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7">
          {IC_PERSONAS.map((persona) => (
            <div
              key={persona.code}
              className="flex flex-col justify-between rounded-card border border-hairline bg-surface p-5 shadow-card"
            >
              <span className="font-mono text-xs font-semibold tracking-wider text-accent-coral">
                {persona.code}
              </span>
              <div className="mt-4 space-y-1.5">
                <h3 className="text-base font-semibold text-ink-primary">{persona.role}</h3>
                <p className="text-sm leading-relaxed text-ink-secondary">{persona.focus}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TierActionButton({ tier }: { tier: CommercialTier }) {
  if (tier.ctaHref.startsWith("http")) {
    return (
      <a
        href={tier.ctaHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-control border border-hairline bg-muted/60 px-4 text-sm font-medium text-ink-primary transition-colors hover:border-strong hover:bg-muted"
      >
        <span>{tier.ctaLabel}</span>
        <IconArrowUpRight size={15} stroke={1.5} />
      </a>
    );
  }
  return (
    <Link
      href={tier.ctaHref}
      className={`inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-control px-4 text-sm font-medium transition-opacity ${
        tier.highlighted
          ? "bg-ink-primary text-ink-inverse shadow-button-primary hover:opacity-90"
          : "border border-hairline bg-surface text-ink-primary shadow-button hover:border-strong hover:bg-muted/60"
      }`}
    >
      <span>{tier.ctaLabel}</span>
      <IconArrowRight size={15} stroke={1.5} />
    </Link>
  );
}

function TierCard({ tier }: { tier: CommercialTier }) {
  return (
    <article
      className={`flex flex-col justify-between rounded-card border p-6 shadow-card ${
        tier.highlighted
          ? "border-strong bg-surface shadow-card-hover"
          : "border-hairline bg-surface/90"
      }`}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-ink-primary">{tier.name}</h3>
          <Badge variant={tier.highlighted ? "coral" : "default"}>{tier.badge}</Badge>
        </div>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-semibold tabular-nums text-ink-primary">
              {tier.priceLabel}
            </span>
            <span className="text-xs text-ink-muted">{tier.priceSub}</span>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-secondary">{tier.summary}</p>
        </div>
        <ul className="space-y-2.5 border-t border-hairline pt-5">
          {tier.features.map((feat) => (
            <li key={feat} className="flex items-start gap-2.5 text-sm text-ink-secondary">
              <IconCheck size={15} stroke={1.5} className="mt-0.5 shrink-0 text-status-pass" />
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-7">
        <TierActionButton tier={tier} />
      </div>
    </article>
  );
}

function FooterClosingBanner() {
  return (
    <div className="flex flex-col items-start justify-between gap-8 rounded-card border border-hairline bg-titanium-subtle/80 p-8 sm:p-10 md:flex-row md:items-center">
      <div className="space-y-2">
        <p className="font-mono text-xs text-accent-coral">START YOUR OWN ARCHIVE</p>
        <h2 className="text-2xl font-semibold tracking-tight text-ink-primary">
          把下一次重要决策，写进经得起时间检验的档案
        </h2>
        <p className="text-sm text-ink-secondary">
          立即注册个人账号，或先进入沙盒完整体验 NVDA / MU 深度研究画布。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/register"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-control bg-ink-primary px-5 text-sm font-medium text-ink-inverse shadow-button-primary transition-opacity hover:opacity-90"
        >
          <span>立即注册</span>
          <IconArrowRight size={15} stroke={1.5} />
        </Link>
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-control border border-hairline bg-surface px-4 text-sm font-medium text-ink-primary shadow-button transition-colors hover:border-strong"
        >
          已有账号登录
        </Link>
      </div>
    </div>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-hairline py-16">
      <div className="mx-auto max-w-6xl px-5 sm:px-10">
        <FooterClosingBanner />
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-hairline pt-6 text-xs text-ink-muted sm:flex-row">
          <span className="font-mono">KANON · 卡农 — Conviction, composed.</span>
          <div className="flex flex-wrap items-center gap-5">
            <a
              href={OFFICIAL_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-ink-secondary transition-colors hover:text-ink-primary"
            >
              <span>品牌官网 kanon.hk</span>
              <IconArrowUpRight size={13} stroke={1.5} />
            </a>
            <Link href="/demo" className="text-ink-secondary hover:text-ink-primary">
              在线沙盒体验
            </Link>
            <Link href="/login" className="text-ink-secondary hover:text-ink-primary">
              登录工作台
            </Link>
            <Link href="/register" className="text-ink-secondary hover:text-ink-primary">
              注册账号
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function LandingCommercialSections() {
  return (
    <>
      <CommitteeShowcase />
      <section id="plans" className="border-t border-hairline bg-surface/65 py-20">
        <div className="mx-auto max-w-6xl space-y-12 px-5 sm:px-10">
          <div className="space-y-3 text-center">
            <Badge variant="mono">03 / ACCESS & PLANS</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
              从个人深度研究起步，随时随认知升级扩展
            </h2>
            <p className="mx-auto max-w-xl text-sm text-ink-secondary">
              使用中国大陆 +86 手机号 30
              秒开通专属隔离空间，数据可随时全量导出，永不锁定你的研究资产。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {COMMERCIAL_TIERS.map((tier) => (
              <TierCard key={tier.id} tier={tier} />
            ))}
          </div>
        </div>
      </section>
      <LandingFooter />
    </>
  );
}
