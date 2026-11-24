"use client";

import {
  calculateImpliedExpectations,
  calculatePriceMarkerPosition,
  type ImpliedExpectations,
  type ValuationScenarioSummary,
} from "@kanon/core";
import { Badge, RollingNumber } from "@kanon/ui";

const ZONE_META = {
  attractive: { label: "高赔率区间", variant: "pass" as const },
  balanced: { label: "赔率均衡", variant: "titanium" as const },
  stretched: { label: "估值偏紧", variant: "warn" as const },
};

function OddsRangeTrack({
  summary,
  hurdle15,
}: {
  summary: ValuationScenarioSummary;
  hurdle15: number;
}) {
  const { bear, base, bull, currentPrice } = summary;
  const pct = (val: number) =>
    calculatePriceMarkerPosition(val, bear.targetPrice, bull.targetPrice);

  return (
    <div className="mt-5">
      <div className="relative h-2 w-full rounded-pill bg-surface">
        <div
          className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-status-pass/75"
          style={{ left: `${pct(hurdle15)}%` }}
          title={`15% 买点 $${hurdle15.toFixed(1)}`}
        />
        <div
          className="absolute top-1/2 h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-ink-primary/45"
          style={{ left: `${pct(base.targetPrice)}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent-coral ring-4 ring-titanium-subtle"
          style={{ left: `${pct(currentPrice)}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between font-mono text-xs tabular-nums">
        <span className="text-ink-muted">
          悲观底线 <RollingNumber value={bear.targetPrice} prefix="$" decimals={1} />
          （下行 <RollingNumber value={summary.downsidePct} suffix="%" decimals={1} />）
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-accent-coral">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-accent-coral" />
          现价 <RollingNumber value={currentPrice} prefix="$" decimals={2} />
        </span>
        <span className="text-ink-muted">
          乐观目标 <RollingNumber value={bull.targetPrice} prefix="$" decimals={1} />
        </span>
      </div>
    </div>
  );
}

function ExpectationsRow({ exp }: { exp: ImpliedExpectations }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-hairline pt-4 font-mono text-xs tabular-nums sm:grid-cols-4">
      <div>
        <div className="font-sans text-ink-muted">相对中性安全边际</div>
        <div className="mt-0.5 text-sm font-semibold text-ink-primary">
          <RollingNumber value={exp.marginOfSafetyPct} suffix="%" decimals={1} />
        </div>
      </div>
      <div>
        <div className="font-sans text-ink-muted">15% 年化安全买点</div>
        <div
          className={`mt-0.5 text-sm font-semibold ${exp.isBelowHurdle15 ? "text-status-pass" : "text-ink-primary"}`}
        >
          <RollingNumber value={exp.hurdleEntry15} prefix="$" decimals={1} />
        </div>
      </div>
      <div>
        <div className="font-sans text-ink-muted">20% 年化安全买点</div>
        <div className="mt-0.5 text-sm font-semibold text-ink-secondary">
          <RollingNumber value={exp.hurdleEntry20} prefix="$" decimals={1} />
        </div>
      </div>
      <div>
        <div className="font-sans text-ink-muted">
          {exp.impliedEpsCagrPct !== null ? "市场隐含 EPS 增速" : "现价隐含远期 EPS"}
        </div>
        <div className="mt-0.5 text-sm font-semibold text-ink-primary">
          {exp.impliedEpsCagrPct !== null ? (
            <>
              <RollingNumber value={exp.impliedEpsCagrPct} suffix="%" decimals={1} />
              {exp.baseEpsCagrPct !== null ? (
                <span className="ml-1 font-normal text-ink-muted">
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
        <div className="text-xs text-ink-muted">
          {summary.horizonYears} 年中性目标价 · 概率期望{" "}
          <RollingNumber value={summary.expectedTargetPrice} prefix="$" decimals={1} />
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <RollingNumber
            value={summary.base.targetPrice}
            prefix="$"
            decimals={1}
            className="text-4xl font-semibold tracking-tight text-ink-primary"
          />
          <RollingNumber
            value={summary.upsidePct}
            suffix="%"
            decimals={1}
            signDisplay="exceptZero"
            className="text-base font-medium text-status-pass"
          />
          <span className="text-sm text-ink-secondary">
            CAGR <RollingNumber value={summary.base.cagrPct} suffix="%" decimals={1} />
          </span>
        </div>
      </div>
      <Badge variant={zone.variant} className="px-3 py-1 font-mono text-sm tabular-nums">
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
    <div className="rounded-card border border-hairline bg-titanium-subtle p-6 shadow-card">
      <BannerHeadline summary={summary} />
      <OddsRangeTrack summary={summary} hurdle15={expectations.hurdleEntry15} />
      <ExpectationsRow exp={expectations} />
    </div>
  );
}
