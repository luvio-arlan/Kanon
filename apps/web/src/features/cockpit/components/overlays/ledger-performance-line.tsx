"use client";

import type { NavPoint, PortfolioPerformanceResponse } from "@kanon/core";
import { Badge, cn, formatMoney } from "@kanon/ui";

function buildPolylinePoints(
  values: ReadonlyArray<number | null>,
  minY: number,
  spanY: number,
): string {
  const w = 320;
  const h = 84;
  const n = Math.max(2, values.length);
  const pts: string[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const x = (i / (n - 1)) * w;
    const y = h - 6 - ((v - minY) / spanY) * (h - 12);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

function NavSvgSparkline({ series }: { series: readonly NavPoint[] }) {
  if (series.length < 2) return null;
  const twrVals = series.map((p) => p.twrCumPct);
  const spyVals = series.map((p) => p.spyTrCumPct);
  const allNums = [...twrVals, ...spyVals].filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (allNums.length < 2) return null;
  const minY = Math.min(0, ...allNums);
  const maxY = Math.max(0, ...allNums);
  const spanY = Math.max(1, maxY - minY);
  const twrLine = buildPolylinePoints(twrVals, minY, spanY);
  const spyLine = buildPolylinePoints(spyVals, minY, spanY);
  const zeroY = 84 - 6 - ((0 - minY) / spanY) * 72;

  return (
    <svg
      viewBox="0 0 320 84"
      className="h-20 w-full overflow-visible"
      role="img"
      aria-label="净值与基准曲线"
    >
      <line
        x1="0"
        y1={zeroY}
        x2="320"
        y2={zeroY}
        className="stroke-hairline"
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      {spyLine ? (
        <polyline fill="none" className="stroke-ink-muted/60" strokeWidth="1.2" points={spyLine} />
      ) : null}
      {twrLine ? (
        <polyline fill="none" className="stroke-ink-primary" strokeWidth="1.75" points={twrLine} />
      ) : null}
    </svg>
  );
}

function fmtSignedPct(v: number | null): string {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function resolveTwrTone(twrPct: number | null | undefined): string {
  if (twrPct === null || twrPct === undefined) return "text-ink-muted";
  return twrPct >= 0 ? "text-status-pass" : "text-status-fail";
}

function UnrecordedDividendAlert({
  items,
  currency,
}: {
  items: PortfolioPerformanceResponse["unrecordedDividends"];
  currency: string;
}) {
  const first = items[0];
  if (!first) return null;
  return (
    <p className="text-xs text-status-warn">
      发现 {items.length} 笔未入账除息分红（最近：{first.ticker} {first.exDate} 约{" "}
      {formatMoney(first.estimatedTotal, currency)}）。
    </p>
  );
}

const BASIS_BADGE_LABELS: Record<string, string> = {
  cost_fallback: "成本估值",
  partial_bars: "部分行情",
  rebase_pending: "待重基",
};

export function LedgerPerformanceLine({
  perf,
  accountName,
  cashBalance,
  baseCurrency = "USD",
}: {
  perf: PortfolioPerformanceResponse | null;
  accountName: string;
  cashBalance: number;
  baseCurrency?: string;
}) {
  const nav = perf?.totalNav ?? cashBalance;
  const series = perf?.series ?? [];
  const basisLabel = perf?.basis ? (BASIS_BADGE_LABELS[perf.basis] ?? null) : null;
  return (
    <div className="space-y-3 rounded-panel border border-hairline bg-canvas/50 p-4 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink-primary">{accountName}</span>
          <span className="font-mono text-ink-muted tabular-nums">
            现金 {formatMoney(cashBalance, baseCurrency, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <span className="font-mono text-sm font-semibold text-ink-primary tabular-nums">
          净值 {formatMoney(nav, baseCurrency, { maximumFractionDigits: 0 })}
        </span>
      </div>
      {series.length >= 2 ? <NavSvgSparkline series={series} /> : null}
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
        <span className={cn("font-medium", resolveTwrTone(perf?.twrPct))}>
          TWR {fmtSignedPct(perf?.twrPct ?? null)}
        </span>
        <span className="text-ink-secondary">SPY 含息 {fmtSignedPct(perf?.spyTrPct ?? null)}</span>
        <span className="text-ink-muted">
          最大回撤 {fmtSignedPct(perf?.maxDrawdownPct ?? null)}
        </span>
        {basisLabel ? <Badge variant="titanium">{basisLabel}</Badge> : null}
      </div>
      <UnrecordedDividendAlert items={perf?.unrecordedDividends ?? []} currency={baseCurrency} />
    </div>
  );
}
