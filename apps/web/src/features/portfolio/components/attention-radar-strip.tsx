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
    <div className="flex flex-wrap items-center gap-2 pt-0.5">
      {hasBuyZone ? (
        <button
          type="button"
          onClick={onFocusBuyZone}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-item border border-status-pass/30 bg-status-pass-soft px-3 text-xs font-medium leading-none text-status-pass transition-opacity duration-150 ease-[var(--ease-kanon)] hover:opacity-85"
        >
          <IconTargetArrow size={14} stroke={1.5} />
          <span>15% 安全买点 · {analytics.inBuyZoneCount}</span>
        </button>
      ) : null}
      {hasWarnings ? (
        <button
          type="button"
          onClick={onFocusWarnings}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-item border border-accent-coral/30 bg-accent-coral-soft px-3 text-xs font-medium leading-none text-accent-coral transition-opacity duration-150 ease-[var(--ease-kanon)] hover:opacity-85"
        >
          <IconAlertTriangle size={14} stroke={1.5} />
          <span>假设预警 · {analytics.warningThesisCount}</span>
        </button>
      ) : null}
      {hasOverCap ? (
        <button
          type="button"
          onClick={onOpenStressTest}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-item border border-status-fail/30 bg-status-fail-soft px-3 text-xs font-medium leading-none text-status-fail transition-opacity duration-150 ease-[var(--ease-kanon)] hover:opacity-85"
        >
          <IconShieldExclamation size={14} stroke={1.5} />
          <span>单标的仓位超上限</span>
        </button>
      ) : null}
    </div>
  );
}
