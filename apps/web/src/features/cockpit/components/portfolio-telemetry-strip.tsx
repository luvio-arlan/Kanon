"use client";

import type { PortfolioAnalytics } from "@kanon/core";
import { RollingNumber } from "@kanon/ui";
import type { ReactNode } from "react";

function MetricItem({
  label,
  sub,
  onClick,
  children,
}: {
  label: string;
  sub?: ReactNode;
  onClick?: () => void;
  children: ReactNode;
}) {
  const inner = (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-ink-muted">{label}</span>
      <div className="flex flex-wrap items-baseline gap-x-2 font-mono tabular-nums">
        {children}
        {sub ? <span className="font-sans text-xs text-ink-muted">{sub}</span> : null}
      </div>
    </div>
  );
  if (!onClick) return <div className="py-1">{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group cursor-pointer rounded-control py-1 text-left transition-opacity hover:opacity-75 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-coral"
    >
      {inner}
    </button>
  );
}

function OddsFigure({ value, activeCount }: { value: number | null; activeCount: number }) {
  if (activeCount === 0) return <span className="text-2xl font-semibold text-ink-primary">—</span>;
  if (value === null) return <span className="text-2xl font-semibold text-ink-primary">∞</span>;
  return (
    <RollingNumber
      value={value}
      suffix="×"
      decimals={2}
      className="text-2xl font-semibold tracking-tight text-ink-primary"
    />
  );
}

function MarginFigure({ value }: { value: number | null }) {
  if (value === null) return <span className="text-2xl font-semibold text-ink-primary">—</span>;
  return (
    <RollingNumber
      value={value}
      suffix="%"
      decimals={1}
      className="text-2xl font-semibold tracking-tight text-ink-primary"
    />
  );
}

export function PortfolioTelemetryStrip({
  analytics,
  onOpenStressTest,
}: {
  analytics: PortfolioAnalytics;
  onOpenStressTest: () => void;
}) {
  const cagrSub =
    analytics.averageBaseCagrPct !== null
      ? `年化 ${analytics.averageBaseCagrPct.toFixed(1)}%`
      : undefined;
  const oddsSub =
    analytics.attractiveCount > 0 ? (
      <span className="text-status-pass">{analytics.attractiveCount} 只优选</span>
    ) : undefined;

  return (
    <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-hairline py-4 sm:grid-cols-4">
      <MetricItem label="跟踪标的" sub={`完成度 ${analytics.averageReadinessPct}%`}>
        <RollingNumber
          value={analytics.activeCount}
          decimals={0}
          className="text-2xl font-semibold tracking-tight text-ink-primary"
        />
      </MetricItem>
      <MetricItem label="平均赔率" sub={oddsSub}>
        <OddsFigure value={analytics.averageRiskReward} activeCount={analytics.activeCount} />
      </MetricItem>
      <MetricItem label="安全边际" sub={cagrSub}>
        <MarginFigure value={analytics.averageMarginOfSafetyPct} />
      </MetricItem>
      <MetricItem
        label="已配仓位"
        sub={`现金 ${analytics.cashBufferPct}%`}
        onClick={onOpenStressTest}
      >
        <RollingNumber
          value={analytics.totalWeightPct}
          suffix="%"
          decimals={0}
          className="text-2xl font-semibold tracking-tight text-ink-primary"
        />
      </MetricItem>
    </div>
  );
}
