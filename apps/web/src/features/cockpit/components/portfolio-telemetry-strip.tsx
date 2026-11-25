"use client";

import {
  calculateResearchReadiness,
  type PortfolioAnalytics,
  type ThesisDetail,
} from "@kanon/core";
import {
  cn,
  KANON_FADE_UP_ITEM,
  KANON_STAGGER_CONTAINER,
  RollingNumber,
  StatCard,
} from "@kanon/ui";
import {
  IconArrowRight,
  IconChartPie,
  IconScale,
  IconShieldCheck,
  IconStack2,
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useMemo } from "react";

const PIPELINE_STEPS: ReadonlyArray<{ step: 1 | 2 | 3 | 4 | 5; label: string }> = [
  { step: 1, label: "商业初筛" },
  { step: 2, label: "核心假设" },
  { step: 3, label: "财报印证" },
  { step: 4, label: "估值赔率" },
  { step: 5, label: "交易纪律" },
];

function computePipelineCounts(theses: readonly ThesisDetail[]): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const t of theses) {
    calculateResearchReadiness(t).steps.forEach((s, idx) => {
      if (s.complete) counts[idx] = (counts[idx] ?? 0) + 1;
    });
  }
  return counts;
}

function OddsValue({ value, activeCount }: { value: number | null; activeCount: number }) {
  if (activeCount === 0) return <span>—</span>;
  if (value === null) return <span>∞</span>;
  return <RollingNumber value={value} suffix="×" decimals={2} />;
}

function MarginValue({ value }: { value: number | null }) {
  if (value === null) return <span>—</span>;
  return <RollingNumber value={value} suffix="%" decimals={1} />;
}

function PipelineStepProgress({
  label,
  doneCount,
  totalCount,
}: {
  label: string;
  doneCount: number;
  totalCount: number;
}) {
  const ratio = totalCount > 0 ? Math.min(100, Math.round((doneCount / totalCount) * 100)) : 0;
  const full = ratio >= 100;
  return (
    <div className="inline-flex flex-col gap-1">
      <div className="inline-flex items-baseline gap-1.5 text-sm">
        <span className="text-ink-secondary">{label}</span>
        <span className="font-mono text-xs font-semibold text-ink-primary tabular-nums">
          {doneCount}/{totalCount}
        </span>
      </div>
      <div className="h-[2px] w-full overflow-hidden rounded-pill bg-muted">
        <div
          className={cn(
            "h-full rounded-pill transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            full ? "bg-status-pass" : "bg-accent-coral",
          )}
          style={{ width: `${ratio}%` }}
        />
      </div>
    </div>
  );
}

function ResearchPipelineRibbon({
  theses,
  analytics,
  onOpenStressTest,
}: {
  theses: readonly ThesisDetail[];
  analytics: PortfolioAnalytics;
  onOpenStressTest: () => void;
}) {
  const active = useMemo(() => theses.filter((t) => t.status !== "archived_veto"), [theses]);
  const counts = useMemo(() => computePipelineCounts(active), [active]);
  if (active.length === 0) return null;

  return (
    <div className="kanon-surface-specular flex flex-wrap items-center justify-between gap-4 rounded-card border border-hairline bg-surface px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
        <span className="font-mono text-xs font-medium tracking-[0.06em] text-ink-muted">
          五步纪律漏斗
        </span>
        {PIPELINE_STEPS.map((item, idx) => (
          <PipelineStepProgress
            key={item.step}
            label={item.label}
            doneCount={counts[idx] ?? 0}
            totalCount={active.length}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onOpenStressTest}
        className="group inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-secondary transition-colors hover:text-accent-coral"
      >
        <span className="font-mono tabular-nums">
          仓位 {analytics.totalWeightPct}% · 现金 {analytics.cashBufferPct}%
        </span>
        <IconArrowRight
          size={14}
          stroke={1.5}
          className="transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </button>
    </div>
  );
}

function buildTelemetryCards(analytics: PortfolioAnalytics, onOpenStressTest: () => void) {
  const cagr = analytics.averageBaseCagrPct;
  const cagrDelta = cagr !== null ? `年化 ${cagr.toFixed(1)}%` : "—";
  return [
    {
      label: "跟踪标的",
      icon: <IconStack2 size={16} stroke={1.5} />,
      value: <RollingNumber value={analytics.activeCount} decimals={0} />,
      caption: "研究完成度",
      delta: `${analytics.averageReadinessPct}%`,
      deltaTone: (analytics.averageReadinessPct >= 80 ? "pass" : "neutral") as "pass" | "neutral",
    },
    {
      label: "组合平均赔率",
      icon: <IconScale size={16} stroke={1.5} />,
      value: <OddsValue value={analytics.averageRiskReward} activeCount={analytics.activeCount} />,
      caption: "高赔率标的",
      delta: `${analytics.attractiveCount} 只`,
      deltaTone: (analytics.attractiveCount > 0 ? "pass" : "neutral") as "pass" | "neutral",
    },
    {
      label: "平均安全边际",
      icon: <IconShieldCheck size={16} stroke={1.5} />,
      value: <MarginValue value={analytics.averageMarginOfSafetyPct} />,
      caption: "三年中性预期",
      delta: cagrDelta,
      deltaTone: ((analytics.averageMarginOfSafetyPct ?? 0) >= 25 ? "pass" : "neutral") as
        | "pass"
        | "neutral",
    },
    {
      label: "已配仓位",
      icon: <IconChartPie size={16} stroke={1.5} />,
      value: <RollingNumber value={analytics.totalWeightPct} suffix="%" decimals={0} />,
      caption: "组合压力测试",
      delta: `现金 ${analytics.cashBufferPct}%`,
      deltaTone: (analytics.overCapTickers.length > 0 ? "fail" : "neutral") as "fail" | "neutral",
      onClick: onOpenStressTest,
    },
  ];
}

function TelemetryStatGrid({
  analytics,
  onOpenStressTest,
}: {
  analytics: PortfolioAnalytics;
  onOpenStressTest: () => void;
}) {
  const cards = buildTelemetryCards(analytics, onOpenStressTest);
  return (
    <motion.div
      variants={KANON_STAGGER_CONTAINER}
      initial={false}
      animate="visible"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => (
        <motion.div key={card.label} variants={KANON_FADE_UP_ITEM}>
          <StatCard {...card} className="h-full w-full" />
        </motion.div>
      ))}
    </motion.div>
  );
}

export function PortfolioTelemetryStrip({
  analytics,
  theses,
  onOpenStressTest,
}: {
  analytics: PortfolioAnalytics;
  theses: readonly ThesisDetail[];
  onOpenStressTest: () => void;
}) {
  return (
    <div className="space-y-4">
      <TelemetryStatGrid analytics={analytics} onOpenStressTest={onOpenStressTest} />
      <ResearchPipelineRibbon
        theses={theses}
        analytics={analytics}
        onOpenStressTest={onOpenStressTest}
      />
    </div>
  );
}
