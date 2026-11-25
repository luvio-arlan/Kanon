"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SecChartDatum {
  fiscalYear: string;
  revenueBillions: number | null;
  fcfBillions: number | null;
  grossMarginPct: number | null;
  dilutedEps: number | null;
}

export interface SecFinancialChartProps {
  data: readonly SecChartDatum[];
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: SecChartDatum }>;
}

function formatBillions(val: number | null): string {
  if (val === null) return "—";
  const sign = val < 0 ? "-" : "";
  return `${sign}$${Math.abs(val).toFixed(1)}B`;
}

function SecTooltipCard({ active, payload }: ChartTooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="rounded-panel border border-strong bg-surface-elevated px-3.5 py-2.5 shadow-dropdown">
      <div className="font-mono text-xs font-semibold text-ink-primary">{item.fiscalYear}</div>
      <div className="mt-1.5 space-y-1 font-mono text-xs tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-ink-muted">营业收入</span>
          <span className="font-medium text-ink-primary">
            {formatBillions(item.revenueBillions)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-ink-muted">自由现金流</span>
          <span className="font-medium text-status-pass">{formatBillions(item.fcfBillions)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-ink-muted">毛利率</span>
          <span className="font-medium text-accent-coral">
            {item.grossMarginPct !== null ? `${item.grossMarginPct.toFixed(1)}%` : "—"}
          </span>
        </div>
        {item.dilutedEps !== null ? (
          <div className="flex items-center justify-between gap-4 border-t border-hairline pt-1">
            <span className="font-sans text-ink-muted">稀释 EPS</span>
            <span className="text-ink-primary">${item.dilutedEps.toFixed(2)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChartLegendRow() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 px-1 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-badge bg-ink-primary/75" />
        营业收入 ($B)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-badge bg-status-pass/80" />
        自由现金流 ($B)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3.5 rounded-pill bg-accent-coral" />
        毛利率 (%)
      </span>
    </div>
  );
}

const AXIS_TICK = { fill: "var(--ink-muted)", fontSize: 12, fontFamily: "var(--font-mono)" };
const AXIS_BASE = { tickLine: false, axisLine: false, tick: AXIS_TICK };
const BAR_BASE = {
  yAxisId: "usd",
  radius: [4, 4, 0, 0] as [number, number, number, number],
  barSize: 24,
  isAnimationActive: false,
};
const LINE_DOT = {
  r: 3.5,
  fill: "var(--bg-surface)",
  stroke: "var(--accent-coral)",
  strokeWidth: 2,
};

const formatAxisBillions = (v: number) => (v < 0 ? `-$${Math.abs(v)}B` : `$${v}B`);

function ChartBody({ data }: { data: SecChartDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
        <CartesianGrid vertical={false} stroke="var(--border-hairline)" strokeDasharray="3 3" />
        <XAxis dataKey="fiscalYear" {...AXIS_BASE} />
        <YAxis yAxisId="usd" tickFormatter={formatAxisBillions} {...AXIS_BASE} />
        <YAxis
          yAxisId="pct"
          orientation="right"
          tickFormatter={(v: number) => `${v}%`}
          {...AXIS_BASE}
        />
        <Tooltip content={<SecTooltipCard />} cursor={{ fill: "var(--bg-muted)", opacity: 0.45 }} />
        <Bar dataKey="revenueBillions" fill="var(--ink-primary)" fillOpacity={0.78} {...BAR_BASE} />
        <Bar dataKey="fcfBillions" fill="var(--status-pass)" fillOpacity={0.8} {...BAR_BASE} />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="grossMarginPct"
          stroke="var(--accent-coral)"
          strokeWidth={2}
          dot={LINE_DOT}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SecFinancialChart({ data }: SecFinancialChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div aria-hidden="true" className="h-56 w-full rounded-control bg-muted/40" />;
  }

  return (
    <div className="px-5 py-4">
      <ChartLegendRow />
      <div className="h-52 w-full">
        <ChartBody data={[...data]} />
      </div>
    </div>
  );
}
