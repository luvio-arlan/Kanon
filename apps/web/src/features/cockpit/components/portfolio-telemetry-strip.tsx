"use client";

import type { PortfolioAnalytics } from "@kanon/core";
import { RollingNumber } from "@kanon/ui";
import type { ReactNode } from "react";

function TelemetryCell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`px-4 py-3.5 sm:px-5 ${className ?? ""}`}>
      <div className="truncate text-xs text-ink-muted">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono tabular-nums">
        {children}
      </div>
    </div>
  );
}

function OddsValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xl font-semibold text-ink-primary">∞</span>;
  return (
    <RollingNumber
      value={value}
      suffix="×"
      decimals={2}
      className="text-xl font-semibold text-ink-primary"
    />
  );
}

function HypothesisHealthCell({ analytics }: { analytics: PortfolioAnalytics }) {
  const warn = analytics.warningHypotheses > 0;
  return (
    <TelemetryCell label="核心假设健康度">
      <span className="h-2 w-2 self-center rounded-pill bg-status-pass" />
      <span className="text-xl font-semibold text-ink-primary">
        {analytics.validatedHypotheses}/{analytics.totalHypotheses}
      </span>
      <span
        className={
          warn
            ? "whitespace-nowrap text-xs text-status-fail"
            : "whitespace-nowrap text-xs text-ink-secondary"
        }
      >
        {warn ? `${analytics.warningHypotheses} 预警` : "零预警"}
      </span>
    </TelemetryCell>
  );
}

export function PortfolioTelemetryStrip({ analytics }: { analytics: PortfolioAnalytics }) {
  const marginLabel =
    analytics.averageMarginOfSafetyPct !== null
      ? `${analytics.averageMarginOfSafetyPct.toFixed(1)}%`
      : "—";

  return (
    <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-card border border-hairline bg-surface/85 shadow-card sm:grid-cols-4">
      <TelemetryCell
        label="跟踪标的 / 研究成熟度"
        className="border-b border-r border-hairline sm:border-b-0"
      >
        <RollingNumber
          value={analytics.activeCount}
          decimals={0}
          className="text-xl font-semibold text-ink-primary"
        />
        <span className="whitespace-nowrap text-xs text-ink-secondary">
          均值 {analytics.averageReadinessPct}%
        </span>
      </TelemetryCell>
      <TelemetryCell
        label="组合平均赔率"
        className="border-b border-hairline sm:border-b-0 sm:border-r"
      >
        <OddsValue value={analytics.averageRiskReward} />
        <span className="whitespace-nowrap text-xs text-status-pass">
          {analytics.attractiveCount} 只高赔率
        </span>
      </TelemetryCell>
      <TelemetryCell label="中性年化 / 安全边际" className="border-r border-hairline">
        <RollingNumber
          value={analytics.averageBaseCagrPct ?? 0}
          suffix="%"
          decimals={1}
          className="text-xl font-semibold text-ink-primary"
        />
        <span className="whitespace-nowrap text-xs text-ink-secondary">边际 {marginLabel}</span>
      </TelemetryCell>
      <HypothesisHealthCell analytics={analytics} />
    </div>
  );
}
