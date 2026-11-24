"use client";

import type { PortfolioAnalytics } from "@kanon/core";
import { IconAlertTriangle, IconShieldExclamation, IconTargetArrow } from "@tabler/icons-react";

export interface AttentionRadarStripProps {
  analytics: PortfolioAnalytics;
  onFocusBuyZone: () => void;
  onFocusWarnings: () => void;
  onOpenStressTest: () => void;
}

export function AttentionRadarStrip({
  analytics,
  onFocusBuyZone,
  onFocusWarnings,
  onOpenStressTest,
}: AttentionRadarStripProps) {
  const hasBuyZone = analytics.inBuyZoneCount > 0;
  const hasWarnings = analytics.warningThesisCount > 0;
  const hasOverCap = analytics.overCapTickers.length > 0;
  if (!hasBuyZone && !hasWarnings && !hasOverCap) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasBuyZone ? (
        <button
          type="button"
          onClick={onFocusBuyZone}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-pill border border-status-pass/30 bg-status-pass-soft px-2.5 text-xs font-medium leading-none text-status-pass transition-opacity hover:opacity-85"
        >
          <IconTargetArrow size={13} stroke={1.5} />
          <span>15% 买点 · {analytics.inBuyZoneCount}</span>
        </button>
      ) : null}
      {hasWarnings ? (
        <button
          type="button"
          onClick={onFocusWarnings}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-pill border border-accent-coral/30 bg-accent-coral-soft px-2.5 text-xs font-medium leading-none text-accent-coral transition-opacity hover:opacity-85"
        >
          <IconAlertTriangle size={13} stroke={1.5} />
          <span>假设预警 · {analytics.warningThesisCount}</span>
        </button>
      ) : null}
      {hasOverCap ? (
        <button
          type="button"
          onClick={onOpenStressTest}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-pill border border-status-fail/30 bg-status-fail-soft px-2.5 text-xs font-medium leading-none text-status-fail transition-opacity hover:opacity-85"
        >
          <IconShieldExclamation size={13} stroke={1.5} />
          <span>仓位超上限</span>
        </button>
      ) : null}
    </div>
  );
}
