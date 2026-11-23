"use client";

import { useEffect, useId, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

export interface ValuationSparklinePoint {
  label: string;
  price: number;
}

export interface ValuationSparklineProps {
  data: ValuationSparklinePoint[];
  tone?: "pass" | "coral" | "ink";
}

interface SparklineTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ValuationSparklinePoint }>;
}

interface SparklineCanvasProps {
  data: ValuationSparklinePoint[];
  minVal: number;
  maxVal: number;
  strokeColor: string;
  gradientId: string;
}

const ACTIVE_DOT_STYLE = {
  r: 4,
  fill: "var(--bg-surface)",
  stroke: "var(--accent-coral)",
  strokeWidth: 2,
};

function SparklineTooltip({ active, payload }: SparklineTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-control border border-strong bg-surface-elevated px-2.5 py-1.5 shadow-card">
      <div className="text-xs text-ink-muted">{point.label}</div>
      <div className="font-mono text-sm font-semibold text-ink-primary tabular-nums">
        ${point.price.toFixed(2)}
      </div>
    </div>
  );
}

function resolveStrokeVar(tone: "pass" | "coral" | "ink"): string {
  if (tone === "pass") return "var(--status-pass)";
  if (tone === "coral") return "var(--accent-coral)";
  return "var(--ink-primary)";
}

function SparklineAreaCanvas(props: SparklineCanvasProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={props.data} margin={{ top: 6, right: 4, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id={props.gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={props.strokeColor} stopOpacity={0.18} />
            <stop offset="100%" stopColor={props.strokeColor} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <YAxis domain={[props.minVal, props.maxVal]} hide />
        <Tooltip
          content={<SparklineTooltip />}
          cursor={{ stroke: "var(--border-strong)", strokeDasharray: "2 3" }}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke={props.strokeColor}
          strokeWidth={2}
          fill={`url(#${props.gradientId})`}
          dot={false}
          activeDot={ACTIVE_DOT_STYLE}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ValuationSparkline({ data, tone = "ink" }: ValuationSparklineProps) {
  const [mounted, setMounted] = useState(false);
  const gradientId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div aria-hidden="true" className="h-16 w-full rounded-control bg-muted/40" />;
  }

  const prices = data.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pad = Math.max((maxPrice - minPrice) * 0.2, maxPrice * 0.03);

  return (
    <div className="h-16 w-full">
      <SparklineAreaCanvas
        data={data}
        minVal={minPrice - pad}
        maxVal={maxPrice + pad}
        strokeColor={resolveStrokeVar(tone)}
        gradientId={gradientId}
      />
    </div>
  );
}
