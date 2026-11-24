"use client";

import type {
  PortfolioStressReport,
  PortfolioStressScenario,
  PositionSizingRow,
} from "@kanon/core";
import { Badge, Button, cn, ProgressBar, RollingNumber, StatCard } from "@kanon/ui";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";

const ROLE_LABELS: Record<PositionSizingRow["portfolioRole"], string> = {
  watchlist: "观察",
  starter: "试探",
  core: "核心",
  exited: "清仓",
};

function formatStressPnl(pnlPct: number | null) {
  if (pnlPct === null) return { text: "—", delta: "未持仓", tone: "neutral" as const };
  const sign = pnlPct > 0 ? "+" : "";
  return {
    text: `${sign}${pnlPct.toFixed(1)}%`,
    delta: pnlPct >= 0 ? "浮盈" : "浮亏",
    tone: pnlPct >= 0 ? ("pass" as const) : ("fail" as const),
  };
}

function formatStressOdds(allocatedPct: number, rr: number | null): string {
  if (allocatedPct === 0) return "—";
  return rr !== null ? `${rr.toFixed(2)}×` : "∞";
}

export function StressKpiStrip({ report }: { report: PortfolioStressReport }) {
  const rrText = formatStressOdds(report.allocatedWeightPct, report.portfolioRiskReward);
  const pnl = formatStressPnl(report.weightedUnrealizedPnlPct);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="已配仓位"
        value={<RollingNumber value={report.allocatedWeightPct} suffix="%" decimals={1} />}
        caption="现金缓冲"
        delta={`${report.cashBufferPct}%`}
      />
      <StatCard
        label="加权赔率"
        value={rrText}
        caption="组合期望"
        delta={
          report.allocatedWeightPct === 0
            ? "待建仓"
            : (report.portfolioRiskReward ?? 0) >= 2
              ? "优选"
              : "均衡"
        }
        deltaTone={(report.portfolioRiskReward ?? 0) >= 2 ? "pass" : "neutral"}
      />
      <StatCard
        label="集中度 HHI"
        value={report.hhiConcentration}
        caption="分散度"
        delta={report.diversificationLabel}
      />
      <StatCard
        label="加权浮盈"
        value={pnl.text}
        caption="持仓成本"
        delta={pnl.delta}
        deltaTone={pnl.tone}
      />
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
      <ProgressBar value={barWidth} max={100} tone={positive ? "pass" : "accent"} size="md" />
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
      <ProgressBar
        value={Math.max(current > 0 ? 6 : 0, fillPct)}
        max={100}
        tone={overCap ? "fail" : "ink"}
        size="md"
        className="flex-1"
      />
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
