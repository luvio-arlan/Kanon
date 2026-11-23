"use client";

import { calculatePriceMarkerPosition, type ValuationScenarioSummary } from "@kanon/core";
import { Badge } from "@kanon/ui";

const ZONE_META = {
  attractive: { label: "高赔率区间", variant: "pass" as const },
  balanced: { label: "赔率均衡", variant: "titanium" as const },
  stretched: { label: "估值偏紧", variant: "warn" as const },
};

function OddsRangeTrack({ summary }: { summary: ValuationScenarioSummary }) {
  const currentPct = calculatePriceMarkerPosition(
    summary.currentPrice,
    summary.bear.targetPrice,
    summary.bull.targetPrice,
  );
  const basePct = calculatePriceMarkerPosition(
    summary.base.targetPrice,
    summary.bear.targetPrice,
    summary.bull.targetPrice,
  );

  return (
    <div className="mt-5">
      <div className="relative h-2 w-full rounded-pill bg-surface">
        <div
          className="absolute top-1/2 h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-ink-primary/45"
          style={{ left: `${basePct}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent-coral ring-4 ring-titanium-subtle"
          style={{ left: `${currentPct}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between font-mono text-xs tabular-nums">
        <span className="text-ink-muted">
          悲观底线 ${summary.bear.targetPrice.toFixed(1)}（下行 {summary.downsidePct.toFixed(1)}%）
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-accent-coral">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-accent-coral" />
          现价 ${summary.currentPrice.toFixed(2)}
        </span>
        <span className="text-ink-muted">乐观目标 ${summary.bull.targetPrice.toFixed(1)}</span>
      </div>
    </div>
  );
}

export function LiveOddsBanner({ summary }: { summary: ValuationScenarioSummary }) {
  const zone = ZONE_META[summary.convictionZone];
  const ratioText =
    summary.riskRewardRatio !== null ? `${summary.riskRewardRatio.toFixed(2)}×` : "∞";

  return (
    <div className="rounded-card border border-hairline bg-titanium-subtle p-6 shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs text-ink-muted">
            {summary.horizonYears} 年中性目标价 · 概率期望 ${summary.expectedTargetPrice.toFixed(1)}
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-3 font-mono tabular-nums">
            <span className="text-4xl font-semibold tracking-tight text-ink-primary">
              ${summary.base.targetPrice.toFixed(1)}
            </span>
            <span className="text-base font-medium text-status-pass">
              {summary.upsidePct > 0 ? "+" : ""}
              {summary.upsidePct.toFixed(1)}%
            </span>
            <span className="text-sm text-ink-secondary">
              CAGR {summary.base.cagrPct.toFixed(1)}%
            </span>
          </div>
        </div>
        <Badge variant={zone.variant} className="px-3 py-1 font-mono text-sm tabular-nums">
          赔率 {ratioText} · {zone.label}
        </Badge>
      </div>
      <OddsRangeTrack summary={summary} />
    </div>
  );
}
