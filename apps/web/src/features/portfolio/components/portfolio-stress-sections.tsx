"use client";

import type {
  PortfolioStressReport,
  PortfolioStressScenario,
  PositionSizingRow,
} from "@kanon/core";
import { Badge, Button, cn, RollingNumber } from "@kanon/ui";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";

const ROLE_LABELS: Record<PositionSizingRow["portfolioRole"], string> = {
  watchlist: "观察",
  starter: "试探",
  core: "核心",
  exited: "清仓",
};

export function StressKpiStrip({ report }: { report: PortfolioStressReport }) {
  const rrText =
    report.portfolioRiskReward !== null ? `${report.portfolioRiskReward.toFixed(2)}×` : "∞";
  const pnlText =
    report.weightedUnrealizedPnlPct !== null
      ? `${report.weightedUnrealizedPnlPct > 0 ? "+" : ""}${report.weightedUnrealizedPnlPct.toFixed(1)}%`
      : "—";

  return (
    <div className="grid grid-cols-2 divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface sm:grid-cols-4 sm:divide-x sm:divide-y-0">
      <div className="px-4 py-3">
        <div className="text-xs text-ink-muted">已配仓位 / 现金</div>
        <div className="mt-1 font-mono text-base font-semibold text-ink-primary tabular-nums">
          <RollingNumber value={report.allocatedWeightPct} suffix="%" decimals={1} />
          <span className="ml-1.5 text-xs font-normal text-ink-muted">
            / {report.cashBufferPct}%
          </span>
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="text-xs text-ink-muted">组合加权赔率</div>
        <div className="mt-1 font-mono text-base font-semibold text-ink-primary tabular-nums">
          {rrText}
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="text-xs text-ink-muted">集中度 HHI</div>
        <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
          <span className="text-base font-semibold text-ink-primary">
            {report.hhiConcentration}
          </span>
          <span className="font-sans text-xs text-ink-secondary">
            {report.diversificationLabel}
          </span>
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="text-xs text-ink-muted">加权成本浮盈</div>
        <div
          className={cn(
            "mt-1 font-mono text-base font-semibold tabular-nums",
            (report.weightedUnrealizedPnlPct ?? 0) >= 0 ? "text-status-pass" : "text-status-fail",
          )}
        >
          {pnlText}
        </div>
      </div>
    </div>
  );
}

export function StressScenarioRow({ scenario }: { scenario: PortfolioStressScenario }) {
  const positive = scenario.portfolioImpactPct >= 0;
  const barWidth = Math.min(100, Math.max(4, Math.abs(scenario.portfolioImpactPct) * 2.4));
  const impactText = `${positive ? "+" : ""}${scenario.portfolioImpactPct.toFixed(1)}%`;
  const investedText = `${scenario.investedImpactPct >= 0 ? "+" : ""}${scenario.investedImpactPct.toFixed(1)}%`;

  return (
    <div className="space-y-2 rounded-control border border-hairline bg-surface p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink-primary">{scenario.label}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-ink-secondary">
            {scenario.assumption}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono tabular-nums">
          <div
            className={cn(
              "text-base font-semibold whitespace-nowrap",
              positive ? "text-status-pass" : "text-accent-coral",
            )}
          >
            {impactText}
          </div>
          <div className="whitespace-nowrap text-xs text-ink-muted">持仓部分 {investedText}</div>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-pill bg-muted">
        <div
          className={cn(
            "h-full rounded-pill transition-[width] duration-200",
            positive ? "bg-status-pass" : "bg-accent-coral",
          )}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="text-xs text-ink-muted">{scenario.driverNote}</div>
    </div>
  );
}

function SizingProgressBar({
  current,
  cap,
  overCap,
}: {
  current: number;
  cap: number;
  overCap: boolean;
}) {
  const fillPct = Math.min(100, (current / Math.max(1, cap)) * 100);
  return (
    <div className="mt-2 flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-muted">
        <div
          className={cn(
            "h-full rounded-pill transition-[width] duration-200",
            overCap ? "bg-status-fail" : "bg-ink-primary",
          )}
          style={{ width: `${Math.max(current > 0 ? 6 : 0, fillPct)}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-xs text-ink-secondary tabular-nums">
        {current}% / 上限 {cap}%
      </span>
    </div>
  );
}

export function SizingLadderRow({
  row,
  onInspect,
}: {
  row: PositionSizingRow;
  onInspect: () => void;
}) {
  const pnlLabel =
    row.unrealizedPnlPct !== null
      ? `${row.unrealizedPnlPct >= 0 ? "+" : ""}${row.unrealizedPnlPct.toFixed(1)}%`
      : "未录成本";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-1">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-ink-primary">{row.ticker}</span>
          <span className="truncate text-sm font-medium text-ink-primary">{row.companyName}</span>
          <Badge variant={row.overCap ? "fail" : "titanium"}>
            {ROLE_LABELS[row.portfolioRole]}
          </Badge>
          {row.overCap ? <Badge variant="fail">超上限</Badge> : null}
        </div>
        <SizingProgressBar
          current={row.currentWeightPct}
          cap={row.targetMaxWeightPct}
          overCap={row.overCap}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono text-xs text-ink-muted tabular-nums">
          <span>
            半凯利 {row.kellyMinPct}%–{row.kellyMaxPct}%
          </span>
          <span>·</span>
          <span>CAGR {row.baseCagrPct.toFixed(1)}%</span>
          <span>·</span>
          <span>浮盈 {pnlLabel}</span>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onInspect}>
        <IconAdjustmentsHorizontal size={13} stroke={1.5} />
        <span>调仓</span>
      </Button>
    </div>
  );
}
