"use client";

import type { PortfolioAnalytics } from "@kanon/core";
import { RollingNumber, StatCard } from "@kanon/ui";
import { IconChartPie, IconScale, IconShieldCheck, IconStack2 } from "@tabler/icons-react";

function OddsValue({ value, activeCount }: { value: number | null; activeCount: number }) {
  if (activeCount === 0) return <span>—</span>;
  if (value === null) return <span>∞</span>;
  return <RollingNumber value={value} suffix="×" decimals={2} />;
}

function MarginValue({ value }: { value: number | null }) {
  if (value === null) return <span>—</span>;
  return <RollingNumber value={value} suffix="%" decimals={1} />;
}

export function PortfolioTelemetryStrip({
  analytics,
  onOpenStressTest,
}: {
  analytics: PortfolioAnalytics;
  onOpenStressTest: () => void;
}) {
  const cagr = analytics.averageBaseCagrPct;
  const cagrDelta = cagr !== null ? `年化 ${cagr.toFixed(1)}%` : "—";
  return (
    <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="跟踪标的"
        icon={<IconStack2 size={15} stroke={1.5} />}
        value={<RollingNumber value={analytics.activeCount} decimals={0} />}
        caption="研究完成度"
        delta={`${analytics.averageReadinessPct}%`}
        deltaTone={analytics.averageReadinessPct >= 80 ? "pass" : "neutral"}
      />
      <StatCard
        label="平均赔率"
        icon={<IconScale size={15} stroke={1.5} />}
        value={
          <OddsValue value={analytics.averageRiskReward} activeCount={analytics.activeCount} />
        }
        caption="高赔率优选"
        delta={`${analytics.attractiveCount} 只`}
        deltaTone={analytics.attractiveCount > 0 ? "pass" : "neutral"}
      />
      <StatCard
        label="安全边际"
        icon={<IconShieldCheck size={15} stroke={1.5} />}
        value={<MarginValue value={analytics.averageMarginOfSafetyPct} />}
        caption="中性三年预期"
        delta={cagrDelta}
        deltaTone={(analytics.averageMarginOfSafetyPct ?? 0) >= 25 ? "pass" : "neutral"}
      />
      <StatCard
        label="已配仓位"
        icon={<IconChartPie size={15} stroke={1.5} />}
        value={<RollingNumber value={analytics.totalWeightPct} suffix="%" decimals={0} />}
        caption="点击压力测试"
        delta={`现金 ${analytics.cashBufferPct}%`}
        deltaTone={analytics.overCapTickers.length > 0 ? "fail" : "neutral"}
        onClick={onOpenStressTest}
      />
    </div>
  );
}
