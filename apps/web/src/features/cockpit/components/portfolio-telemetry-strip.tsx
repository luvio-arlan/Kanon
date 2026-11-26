"use client";

import type { PortfolioAnalytics, ThesisDetail } from "@kanon/core";
import { KANON_FADE_UP_ITEM, KANON_STAGGER_CONTAINER, RollingNumber, StatCard } from "@kanon/ui";
import { IconChartPie, IconScale, IconShieldCheck, IconStack2 } from "@tabler/icons-react";
import { motion } from "framer-motion";

function OddsValue({ value, activeCount }: { value: number | null; activeCount: number }) {
  if (activeCount === 0) return <span>—</span>;
  if (value === null) return <span>∞</span>;
  return <RollingNumber value={value} suffix="×" decimals={2} />;
}

function MarginValue({ value }: { value: number | null }) {
  if (value === null) return <span>—</span>;
  return <RollingNumber value={value} suffix="%" decimals={1} />;
}

function buildTelemetryCards(analytics: PortfolioAnalytics, onOpenStressTest: () => void) {
  const cagr = analytics.averageBaseCagrPct;
  const cagrDelta = cagr !== null ? `${cagr.toFixed(1)}%` : "—";
  return [
    {
      label: "跟踪标的",
      icon: <IconStack2 size={16} stroke={1.5} />,
      value: <RollingNumber value={analytics.activeCount} decimals={0} />,
      caption: "平均完成度",
      delta: `${analytics.averageReadinessPct}%`,
      deltaTone: (analytics.averageReadinessPct >= 80 ? "pass" : "neutral") as "pass" | "neutral",
    },
    {
      label: "平均赔率",
      icon: <IconScale size={16} stroke={1.5} />,
      value: <OddsValue value={analytics.averageRiskReward} activeCount={analytics.activeCount} />,
      caption: "高赔率",
      delta: `${analytics.attractiveCount} 只`,
      deltaTone: (analytics.attractiveCount > 0 ? "pass" : "neutral") as "pass" | "neutral",
    },
    {
      label: "平均安全边际",
      icon: <IconShieldCheck size={16} stroke={1.5} />,
      value: <MarginValue value={analytics.averageMarginOfSafetyPct} />,
      caption: "中性情景年化",
      delta: cagrDelta,
      deltaTone: ((analytics.averageMarginOfSafetyPct ?? 0) >= 25 ? "pass" : "neutral") as
        | "pass"
        | "neutral",
    },
    {
      label: "已配仓位",
      icon: <IconChartPie size={16} stroke={1.5} />,
      value: <RollingNumber value={analytics.totalWeightPct} suffix="%" decimals={0} />,
      caption: "现金缓冲",
      delta: `${analytics.cashBufferPct}%`,
      deltaTone: (analytics.overCapTickers.length > 0 ? "fail" : "neutral") as "fail" | "neutral",
      onClick: onOpenStressTest,
    },
  ];
}

export function PortfolioTelemetryStrip({
  analytics,
  onOpenStressTest,
}: {
  analytics: PortfolioAnalytics;
  theses: readonly ThesisDetail[];
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
