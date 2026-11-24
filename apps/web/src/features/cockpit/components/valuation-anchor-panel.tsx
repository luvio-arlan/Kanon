"use client";

import {
  type ConvictionZone,
  calculateImpliedExpectations,
  calculatePriceMarkerPosition,
  type SparklinePoint,
  type ValuationScenarioSummary,
} from "@kanon/core";
import { Badge, RollingNumber, ValuationSparkline } from "@kanon/ui";

export interface ValuationAnchorPanelProps {
  valuation: ValuationScenarioSummary;
  priceHistory: readonly SparklinePoint[];
}

const ZONE_STYLE: Record<
  ConvictionZone,
  { badgeVariant: "pass" | "titanium" | "warn"; sparkTone: "pass" | "coral" | "ink" }
> = {
  attractive: { badgeVariant: "pass", sparkTone: "pass" },
  balanced: { badgeVariant: "titanium", sparkTone: "ink" },
  stretched: { badgeVariant: "warn", sparkTone: "coral" },
};

function formatCompactPrice(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(1)}`;
}

function ScenarioRangeRail({ valuation }: { valuation: ValuationScenarioSummary }) {
  const currentPct = calculatePriceMarkerPosition(
    valuation.currentPrice,
    valuation.bear.targetPrice,
    valuation.bull.targetPrice,
  );
  const basePct = calculatePriceMarkerPosition(
    valuation.base.targetPrice,
    valuation.bear.targetPrice,
    valuation.bull.targetPrice,
  );

  return (
    <div className="mt-6">
      <div className="relative h-1.5 w-full rounded-pill bg-titanium">
        <div
          className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-ink-primary/45 transition-all duration-150"
          style={{ left: `${basePct}%` }}
          title={`中性目标 ${formatCompactPrice(valuation.base.targetPrice)}`}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent-coral ring-4 ring-surface transition-all duration-150"
          style={{ left: `${currentPct}%` }}
          title={`当前价 ${formatCompactPrice(valuation.currentPrice)}`}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between font-mono text-xs tabular-nums">
        <span className="text-ink-muted">
          悲观 {formatCompactPrice(valuation.bear.targetPrice)}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-accent-coral">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-accent-coral" />
          当前 {formatCompactPrice(valuation.currentPrice)}
        </span>
        <span className="text-ink-muted">
          乐观 {formatCompactPrice(valuation.bull.targetPrice)}
        </span>
      </div>
    </div>
  );
}

function TargetHeadline({
  valuation,
  badgeVariant,
  belowHurdle,
}: {
  valuation: ValuationScenarioSummary;
  badgeVariant: "pass" | "titanium" | "warn";
  belowHurdle: boolean;
}) {
  const ratioText =
    valuation.riskRewardRatio !== null
      ? `赔率 ${valuation.riskRewardRatio.toFixed(2)}×`
      : "无下行保底";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span>{valuation.horizonYears} 年中性目标价</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono tabular-nums">CAGR {valuation.base.cagrPct.toFixed(1)}%</span>
        {belowHurdle ? (
          <span className="font-mono text-status-pass tabular-nums">· ≤15%买点</span>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
        <RollingNumber
          value={valuation.base.targetPrice}
          prefix="$"
          decimals={1}
          className="text-[36px] font-semibold leading-none tracking-[-0.03em] text-ink-primary"
        />
        <Badge variant={badgeVariant} className="font-mono tabular-nums">
          <RollingNumber
            value={valuation.upsidePct}
            suffix="%"
            decimals={0}
            signDisplay="exceptZero"
          />
          <span className="opacity-40">·</span>
          <span>{ratioText}</span>
        </Badge>
      </div>
    </div>
  );
}

export function ValuationAnchorPanel({ valuation, priceHistory }: ValuationAnchorPanelProps) {
  const zone = ZONE_STYLE[valuation.convictionZone];
  const expectations = calculateImpliedExpectations({ summary: valuation });

  return (
    <div className="px-7 pb-6">
      <div className="flex items-end justify-between gap-4">
        <TargetHeadline
          valuation={valuation}
          badgeVariant={zone.badgeVariant}
          belowHurdle={expectations.isBelowHurdle15}
        />
        <div className="w-32 shrink-0 sm:w-40">
          <ValuationSparkline
            data={[...priceHistory]}
            tone={zone.sparkTone}
            targetPrice={valuation.base.targetPrice}
          />
        </div>
      </div>
      <ScenarioRangeRail valuation={valuation} />
    </div>
  );
}
