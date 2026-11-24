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
  { badgeVariant: "pass" | "titanium" | "warn"; sparkTone: "pass" | "coral" | "ink"; label: string }
> = {
  attractive: { badgeVariant: "pass", sparkTone: "pass", label: "高赔率" },
  balanced: { badgeVariant: "titanium", sparkTone: "ink", label: "均衡" },
  stretched: { badgeVariant: "warn", sparkTone: "coral", label: "偏紧" },
};

function formatCompactPrice(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(1)}`;
}

function ScenarioRangeRail({
  valuation,
  hurdle15,
}: {
  valuation: ValuationScenarioSummary;
  hurdle15: number;
}) {
  const pct = (v: number) =>
    calculatePriceMarkerPosition(v, valuation.bear.targetPrice, valuation.bull.targetPrice);

  return (
    <div className="mt-5">
      <div className="relative h-1.5 w-full rounded-pill bg-muted">
        <div
          className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-status-pass/75"
          style={{ left: `${pct(hurdle15)}%` }}
          title={`15% 安全买点 ${formatCompactPrice(hurdle15)}`}
        />
        <div
          className="absolute top-1/2 h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-ink-primary/45"
          style={{ left: `${pct(valuation.base.targetPrice)}%` }}
          title={`中性目标 ${formatCompactPrice(valuation.base.targetPrice)}`}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent-coral ring-4 ring-surface"
          style={{ left: `${pct(valuation.currentPrice)}%` }}
          title={`现价 ${formatCompactPrice(valuation.currentPrice)}`}
        />
      </div>
      <div className="mt-3 flex items-center justify-between font-mono text-xs tabular-nums">
        <span className="text-ink-muted">
          悲观 {formatCompactPrice(valuation.bear.targetPrice)}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-accent-coral">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-accent-coral" />
          现价 {formatCompactPrice(valuation.currentPrice)}
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
  marginPct,
  belowHurdle,
}: {
  valuation: ValuationScenarioSummary;
  badgeVariant: "pass" | "titanium" | "warn";
  marginPct: number;
  belowHurdle: boolean;
}) {
  const ratioText =
    valuation.riskRewardRatio !== null ? `${valuation.riskRewardRatio.toFixed(2)}×` : "∞";
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
        <span>{valuation.horizonYears} 年中性目标</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono tabular-nums">安全边际 {marginPct.toFixed(0)}%</span>
        {belowHurdle ? (
          <span className="font-mono font-medium text-status-pass">· 买点内</span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <RollingNumber
          value={valuation.base.targetPrice}
          prefix="$"
          decimals={1}
          className="text-[38px] font-light leading-none tracking-[-0.04em] text-ink-primary"
        />
        <Badge variant={badgeVariant} className="whitespace-nowrap font-mono text-xs tabular-nums">
          <RollingNumber
            value={valuation.upsidePct}
            suffix="%"
            decimals={0}
            signDisplay="exceptZero"
          />
          <span className="opacity-45">·</span>
          <span>赔率 {ratioText}</span>
        </Badge>
      </div>
      <div className="mt-2 font-mono text-xs text-ink-secondary tabular-nums">
        三年复合年化 {valuation.base.cagrPct.toFixed(1)}%
      </div>
    </div>
  );
}

export function ValuationAnchorPanel({ valuation, priceHistory }: ValuationAnchorPanelProps) {
  const zone = ZONE_STYLE[valuation.convictionZone];
  const exp = calculateImpliedExpectations({ summary: valuation });

  return (
    <div className="px-6 pb-5 pt-1">
      <div className="flex items-end justify-between gap-4">
        <TargetHeadline
          valuation={valuation}
          badgeVariant={zone.badgeVariant}
          marginPct={exp.marginOfSafetyPct}
          belowHurdle={exp.isBelowHurdle15}
        />
        <div className="hidden w-36 shrink-0 sm:block">
          <ValuationSparkline
            data={[...priceHistory]}
            tone={zone.sparkTone}
            targetPrice={valuation.base.targetPrice}
          />
        </div>
      </div>
      <ScenarioRangeRail valuation={valuation} hurdle15={exp.hurdleEntry15} />
    </div>
  );
}
