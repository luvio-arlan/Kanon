"use client";

import type { PortfolioAnalytics } from "@kanon/core";
import { Badge } from "@kanon/ui";
import {
  IconActivityHeartbeat,
  IconAlertTriangle,
  IconRadar2,
  IconTargetArrow,
} from "@tabler/icons-react";

export interface AttentionRadarStripProps {
  analytics: PortfolioAnalytics;
  onFocusBuyZone: () => void;
  onFocusWarnings: () => void;
  onOpenStressTest: () => void;
}

function RadarExposureGroup({ analytics }: { analytics: PortfolioAnalytics }) {
  const topSector = analytics.sectorExposures[0];
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="inline-flex items-center gap-1.5 font-medium text-ink-secondary">
        <IconRadar2 size={14} stroke={1.5} className="text-ink-muted" />
        <span>组合风控与信号雷达</span>
      </span>
      <span aria-hidden="true" className="text-ink-muted">
        ·
      </span>
      <span className="font-mono text-ink-primary tabular-nums">
        已配仓位 {analytics.totalWeightPct}%
      </span>
      <span className="font-mono text-ink-muted tabular-nums">
        现金缓冲 {analytics.cashBufferPct}%
      </span>
      {topSector && topSector.weightPct > 0 ? (
        <Badge variant={topSector.overConcentrated ? "warn" : "default"}>
          {topSector.sector} {topSector.weightPct}%{topSector.overConcentrated ? " · 集中提醒" : ""}
        </Badge>
      ) : null}
      {analytics.overCapTickers.length > 0 ? (
        <Badge variant="fail">超上限：{analytics.overCapTickers.join(" / ")}</Badge>
      ) : null}
    </div>
  );
}

function RadarSignalPills({
  analytics,
  onFocusBuyZone,
  onFocusWarnings,
  onOpenStressTest,
}: AttentionRadarStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {analytics.inBuyZoneCount > 0 ? (
        <button
          type="button"
          onClick={onFocusBuyZone}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-pill border border-status-pass/30 bg-status-pass-soft px-2.5 text-xs font-medium leading-none text-status-pass transition-[transform,opacity] duration-150 hover:opacity-85 active:scale-[0.97]"
        >
          <IconTargetArrow size={13} stroke={1.5} />
          <span>进入 15% 买点 ({analytics.inBuyZoneCount})</span>
        </button>
      ) : null}
      {analytics.warningThesisCount > 0 ? (
        <button
          type="button"
          onClick={onFocusWarnings}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-pill border border-accent-coral/30 bg-accent-coral-soft px-2.5 text-xs font-medium leading-none text-accent-coral transition-[transform,opacity] duration-150 hover:opacity-85 active:scale-[0.97]"
        >
          <IconAlertTriangle size={13} stroke={1.5} />
          <span>假设预警 ({analytics.warningThesisCount})</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={onOpenStressTest}
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-pill border border-hairline bg-surface px-2.5 text-xs font-medium leading-none text-ink-primary shadow-button transition-[transform,border-color,background-color] duration-150 hover:border-strong hover:bg-muted/70 active:scale-[0.97]"
      >
        <IconActivityHeartbeat size={13} stroke={1.5} className="text-ink-secondary" />
        <span>压力测试</span>
      </button>
    </div>
  );
}

export function AttentionRadarStrip(props: AttentionRadarStripProps) {
  const { analytics } = props;
  const hasSignals =
    analytics.inBuyZoneCount > 0 ||
    analytics.warningThesisCount > 0 ||
    analytics.overCapTickers.length > 0 ||
    analytics.totalWeightPct > 0 ||
    analytics.activeCount > 0;
  if (!hasSignals) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface/90 px-4 py-2.5 text-xs shadow-card">
      <RadarExposureGroup analytics={analytics} />
      <RadarSignalPills {...props} />
    </div>
  );
}
