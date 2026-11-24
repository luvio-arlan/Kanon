"use client";

import { Badge, KANON_LENS_VARIANTS, ReadinessRing, RollingNumber } from "@kanon/ui";
import { IconArrowRight, IconCheck, IconClockHour4, IconShieldCheck } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { LANDING_SPECIMENS, type LandingSpecimen } from "../data/landing-content";

function computeBarPositions(item: LandingSpecimen) {
  const minVal = Math.min(item.bearTarget, item.currentPrice) * 0.92;
  const span = Math.max(1, item.bullTarget * 1.05 - minVal);
  const clamp = (v: number) => Math.min(96, Math.max(4, ((v - minVal) / span) * 100));
  const currentPct = clamp(item.currentPrice);
  const basePct = clamp(item.baseTarget);
  return {
    currentPct,
    basePct,
    left: Math.min(currentPct, basePct),
    width: Math.abs(basePct - currentPct),
  };
}

function SpecimenOddsBar({ item }: { item: LandingSpecimen }) {
  const pos = computeBarPositions(item);
  return (
    <div className="space-y-2.5 border-y border-hairline py-4">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span className="font-mono">3Y 情景锚点</span>
        <span className="font-mono tabular-nums text-ink-secondary">
          现价 ${item.currentPrice.toFixed(1)} → 中性 ${item.baseTarget.toFixed(1)}
        </span>
      </div>
      <div className="relative h-2 w-full rounded-pill bg-muted">
        <div
          className="absolute inset-y-0 rounded-pill bg-titanium"
          style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-surface bg-accent-coral shadow-button"
          style={{ left: `${pos.currentPct}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-ink-primary"
          style={{ left: `${pos.basePct}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 pt-0.5 font-mono text-xs tabular-nums">
        <div>
          <span className="text-ink-muted">悲观 </span>
          <span className="text-ink-secondary">${item.bearTarget}</span>
        </div>
        <div className="text-center">
          <span className="text-ink-muted">中性 </span>
          <span className="font-semibold text-ink-primary">${item.baseTarget}</span>
        </div>
        <div className="text-right">
          <span className="text-ink-muted">乐观 </span>
          <span className="text-status-pass">${item.bullTarget}</span>
        </div>
      </div>
    </div>
  );
}

function SpecimenMetrics({ active }: { active: LandingSpecimen }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-control border border-hairline bg-canvas/70 px-3.5 py-2.5">
        <div className="text-xs text-ink-muted">赔率 Risk / Reward</div>
        <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink-primary">
          <RollingNumber value={active.riskReward} decimals={2} suffix="×" />
        </div>
      </div>
      <div className="rounded-control border border-hairline bg-canvas/70 px-3.5 py-2.5">
        <div className="text-xs text-ink-muted">中性年化 CAGR</div>
        <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-accent-coral">
          <RollingNumber value={active.baseCagrPct} decimals={1} prefix="+" suffix="%" />
        </div>
      </div>
    </div>
  );
}

function SpecimenDetails({ active }: { active: LandingSpecimen }) {
  return (
    <motion.div
      key={active.ticker}
      variants={KANON_LENS_VARIANTS}
      initial="enter"
      animate="center"
      exit="exit"
      className="space-y-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-ink-primary">
              {active.companyName}
            </h2>
            <span className="font-mono text-xs text-ink-muted">{active.ticker}</span>
          </div>
          <p className="mt-0.5 text-xs text-ink-secondary">{active.sectorTag}</p>
        </div>
        <ReadinessRing
          scorePct={active.readinessPct}
          size={30}
          label={`成熟度 ${active.readinessPct}%`}
        />
      </div>
      <SpecimenMetrics active={active} />
      <SpecimenOddsBar item={active} />
      <div className="space-y-1.5">
        <div className="kanon-micro-label text-ink-muted">VARIANT PERCEPTION · 非共识判断</div>
        <p className="text-sm leading-relaxed text-ink-secondary">{active.variantPerception}</p>
      </div>
      <ul className="space-y-1.5">
        {active.hypotheses.map((hyp) => (
          <li key={hyp.label} className="flex items-center gap-2 text-xs text-ink-secondary">
            {hyp.state === "validated" ? (
              <IconCheck size={14} stroke={1.5} className="shrink-0 text-status-pass" />
            ) : (
              <IconClockHour4 size={14} stroke={1.5} className="shrink-0 text-status-warn" />
            )}
            <span>{hyp.label}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export function LandingSpecimenCard() {
  const [selectedTicker, setSelectedTicker] = useState(LANDING_SPECIMENS[0]?.ticker ?? "NVDA");
  const active =
    LANDING_SPECIMENS.find((item) => item.ticker === selectedTicker) ?? LANDING_SPECIMENS[0];
  if (!active) return null;

  return (
    <div className="rounded-card border border-hairline bg-surface p-6 shadow-card-hover">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-1.5 rounded-control border border-hairline bg-muted/70 p-1">
          {LANDING_SPECIMENS.map((item) => (
            <button
              key={item.ticker}
              type="button"
              onClick={() => setSelectedTicker(item.ticker)}
              className={`cursor-pointer rounded-control px-2.5 py-1 font-mono text-xs font-medium transition-all ${
                item.ticker === active.ticker
                  ? "bg-surface text-ink-primary shadow-pill-active"
                  : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              {item.ticker}
            </button>
          ))}
        </div>
        <Badge variant="pass">
          <IconShieldCheck size={13} stroke={1.5} />
          零杠杆已锁
        </Badge>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <SpecimenDetails active={active} />
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-between border-t border-hairline pt-4">
        <span className="text-xs text-ink-muted">示例数据支持在线完整交互</span>
        <Link
          href="/demo"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-coral transition-opacity hover:opacity-80"
        >
          <span>进入沙盒画布</span>
          <IconArrowRight size={14} stroke={1.5} />
        </Link>
      </div>
    </div>
  );
}
