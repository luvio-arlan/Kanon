"use client";

import {
  calculateImpliedExpectations,
  calculatePriceMarkerPosition,
  type ImpliedExpectations,
  type ValuationScenarioSummary,
} from "@kanon/core";
import { Badge, Card, RollingNumber } from "@kanon/ui";

const ZONE_META = {
  attractive: { label: "高赔率区间", variant: "pass" as const },
  balanced: { label: "赔率均衡", variant: "titanium" as const },
  stretched: { label: "估值偏紧", variant: "warn" as const },
};

function OddsRangeLegend({
  summary,
  hurdle15,
}: {
  summary: ValuationScenarioSummary;
  hurdle15: number;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-xs tabular-nums">
      <span className="text-ink-muted">
        悲观 <RollingNumber value={summary.bear.targetPrice} prefix="$" decimals={1} />
        （-
        <RollingNumber value={Math.abs(summary.downsidePct)} suffix="%" decimals={1} />）
      </span>
      <span className="inline-flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-status-pass">
          <span aria-hidden="true" className="h-2.5 w-[2px] rounded-pill bg-status-pass" />
          15% 买点 <RollingNumber value={hurdle15} prefix="$" decimals={1} />
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-accent-coral">
          <span aria-hidden="true" className="h-2 w-2 rounded-pill bg-accent-coral" />
          现价 <RollingNumber value={summary.currentPrice} prefix="$" decimals={2} />
        </span>
      </span>
      <span className="text-ink-muted">
        乐观 <RollingNumber value={summary.bull.targetPrice} prefix="$" decimals={1} />
      </span>
    </div>
  );
}

function OddsRangeTrack({
  summary,
  hurdle15,
  belowHurdle,
}: {
  summary: ValuationScenarioSummary;
  hurdle15: number;
  belowHurdle: boolean;
}) {
  const { bear, base, bull, currentPrice } = summary;
  const pct = (val: number) =>
    calculatePriceMarkerPosition(val, bear.targetPrice, bull.targetPrice);
  const curPos = pct(currentPrice);
  const basePos = pct(base.targetPrice);
  const bandLeft = Math.min(curPos, basePos);
  const bandWidth = Math.abs(basePos - curPos);

  return (
    <div className="mt-5">
      <div className="relative h-2 w-full rounded-pill bg-muted">
        <div
          className={`absolute inset-y-0 rounded-pill transition-[left,width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            belowHurdle ? "bg-status-pass/35" : "bg-ink-primary/18"
          }`}
          style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-status-pass/80 transition-[left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: `${pct(hurdle15)}%` }}
          title={`15% 买点 $${hurdle15.toFixed(1)}`}
        />
        <div
          className="absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-ink-primary/50 transition-[left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: `${basePos}%` }}
          title={`中性目标 $${base.targetPrice.toFixed(1)}`}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent-coral ring-4 ring-surface transition-[left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: `${curPos}%` }}
          title={`现价 $${currentPrice.toFixed(2)}`}
        />
      </div>
      <OddsRangeLegend summary={summary} hurdle15={hurdle15} />
    </div>
  );
}

function ExpectationsRow({ exp }: { exp: ImpliedExpectations }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4 border-t border-hairline pt-5 font-mono tabular-nums sm:grid-cols-4">
      <div>
        <div className="font-sans text-xs text-ink-muted">相对中性安全边际</div>
        <div className="mt-1 text-lg font-medium text-ink-primary">
          <RollingNumber value={exp.marginOfSafetyPct} suffix="%" decimals={1} />
        </div>
      </div>
      <div>
        <div className="font-sans text-xs text-ink-muted">15% 年化安全买点</div>
        <div
          className={`mt-1 text-lg font-medium ${exp.isBelowHurdle15 ? "text-status-pass" : "text-ink-primary"}`}
        >
          <RollingNumber value={exp.hurdleEntry15} prefix="$" decimals={1} />
        </div>
      </div>
      <div>
        <div className="font-sans text-xs text-ink-muted">20% 年化安全买点</div>
        <div className="mt-1 text-lg font-medium text-ink-secondary">
          <RollingNumber value={exp.hurdleEntry20} prefix="$" decimals={1} />
        </div>
      </div>
      <div>
        <div className="font-sans text-xs text-ink-muted">
          {exp.impliedEpsCagrPct !== null ? "市场隐含 EPS 增速" : "现价隐含远期 EPS"}
        </div>
        <div className="mt-1 text-lg font-medium text-ink-primary">
          {exp.impliedEpsCagrPct !== null ? (
            <>
              <RollingNumber value={exp.impliedEpsCagrPct} suffix="%" decimals={1} />
              {exp.baseEpsCagrPct !== null ? (
                <span className="ml-1.5 text-xs font-normal text-ink-muted">
                  vs {exp.baseEpsCagrPct.toFixed(1)}%
                </span>
              ) : null}
            </>
          ) : (
            <RollingNumber value={exp.impliedEpsAtBasePe} prefix="$" decimals={2} />
          )}
        </div>
      </div>
    </div>
  );
}

function BannerHeadline({ summary }: { summary: ValuationScenarioSummary }) {
  const zone = ZONE_META[summary.convictionZone];
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-sm text-ink-muted">
          {summary.horizonYears} 年中性目标价 · 概率期望{" "}
          <RollingNumber value={summary.expectedTargetPrice} prefix="$" decimals={1} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-baseline gap-4">
          <RollingNumber
            value={summary.base.targetPrice}
            prefix="$"
            decimals={1}
            className="text-5xl font-light leading-none tracking-[-0.045em] text-ink-primary"
          />
          <RollingNumber
            value={summary.upsidePct}
            suffix="%"
            decimals={1}
            signDisplay="exceptZero"
            className="text-lg font-medium text-status-pass"
          />
          <span className="font-mono text-sm text-ink-secondary tabular-nums">
            CAGR <RollingNumber value={summary.base.cagrPct} suffix="%" decimals={1} />
          </span>
        </div>
      </div>
      <Badge variant={zone.variant} className="px-3.5 py-2 font-mono text-sm tabular-nums">
        <span>赔率</span>
        {summary.riskRewardRatio !== null ? (
          <RollingNumber value={summary.riskRewardRatio} suffix="×" decimals={2} />
        ) : (
          <span>∞</span>
        )}
        <span>· {zone.label}</span>
      </Badge>
    </div>
  );
}

export function LiveOddsBanner({
  summary,
  trailingEps,
}: {
  summary: ValuationScenarioSummary;
  trailingEps?: number | null;
}) {
  const expectations = calculateImpliedExpectations({ summary, trailingEps });
  return (
    <Card spotlight className="p-6 sm:p-8">
      <BannerHeadline summary={summary} />
      <OddsRangeTrack
        summary={summary}
        hurdle15={expectations.hurdleEntry15}
        belowHurdle={expectations.isBelowHurdle15}
      />
      <ExpectationsRow exp={expectations} />
    </Card>
  );
}
