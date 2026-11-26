"use client";

import { memo, useId, useMemo, useState } from "react";

export interface ValuationSparklinePoint {
  label: string;
  price: number;
}

export interface ValuationSparklineProps {
  data: readonly ValuationSparklinePoint[];
  tone?: "pass" | "coral" | "ink";
  targetPrice?: number;
}

interface PlotPoint {
  x: number;
  y: number;
  label: string;
  price: number;
}

const VIEW_W = 160;
const VIEW_H = 68;
const PAD_X = 9;
const PAD_TOP = 9;
const PAD_BOTTOM = 7;

function resolveStrokeVar(tone: "pass" | "coral" | "ink"): string {
  if (tone === "pass") return "var(--status-pass)";
  if (tone === "coral") return "var(--accent-coral)";
  return "var(--ink-primary)";
}

function buildGeometry(data: readonly ValuationSparklinePoint[], targetPrice?: number) {
  const prices = data.map((d) => d.price);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const span = Math.max(rawMax - rawMin, rawMax * 0.06, 1);
  const minVal = rawMin - span * 0.22;
  const maxVal = rawMax + span * 0.22;
  const plotW = VIEW_W - PAD_X * 2;
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const denom = Math.max(data.length - 1, 1);
  const toY = (v: number) => PAD_TOP + (1 - (v - minVal) / (maxVal - minVal)) * plotH;
  const points: PlotPoint[] = data.map((d, i) => ({
    x: Number((PAD_X + (i / denom) * plotW).toFixed(2)),
    y: Number(toY(d.price).toFixed(2)),
    label: d.label,
    price: d.price,
  }));
  const targetY =
    targetPrice !== undefined && targetPrice >= minVal && targetPrice <= maxVal * 1.08
      ? Number(Math.max(PAD_TOP, Math.min(VIEW_H - PAD_BOTTOM, toY(targetPrice))).toFixed(2))
      : null;
  return { points, targetY };
}

function buildSmoothPaths(points: readonly PlotPoint[]): { line: string; area: string } {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return { line: "", area: "" };
  if (points.length === 1) {
    const line = `M ${first.x} ${first.y} L ${VIEW_W - PAD_X} ${first.y}`;
    return { line, area: `${line} L ${VIEW_W - PAD_X} ${VIEW_H} L ${first.x} ${VIEW_H} Z` };
  }
  let line = `M ${first.x} ${first.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)] ?? first;
    const p1 = points[i] ?? first;
    const p2 = points[i + 1] ?? last;
    const p3 = points[Math.min(points.length - 1, i + 2)] ?? last;
    const c1x = Number((p1.x + (p2.x - p0.x) / 6).toFixed(2));
    const c1y = Number((p1.y + (p2.y - p0.y) / 6).toFixed(2));
    const c2x = Number((p2.x - (p3.x - p1.x) / 6).toFixed(2));
    const c2y = Number((p2.y - (p3.y - p1.y) / 6).toFixed(2));
    line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  const baseY = VIEW_H - 2;
  return { line, area: `${line} L ${last.x} ${baseY} L ${first.x} ${baseY} Z` };
}

function SparklineMarker({
  active,
  last,
  stroke,
}: {
  active: PlotPoint | null;
  last?: PlotPoint;
  stroke: string;
}) {
  if (active) {
    return (
      <g>
        <line
          x1={active.x}
          x2={active.x}
          y1={PAD_TOP}
          y2={VIEW_H - PAD_BOTTOM}
          stroke="var(--border-strong)"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        <circle
          cx={active.x}
          cy={active.y}
          r={3.5}
          fill="var(--bg-surface)"
          stroke="var(--accent-coral)"
          strokeWidth={2}
        />
      </g>
    );
  }
  if (!last) return null;
  return (
    <g>
      <circle cx={last.x} cy={last.y} r={5} fill={stroke} className="kanon-terminal-halo" />
      <circle
        cx={last.x}
        cy={last.y}
        r={3}
        fill="var(--bg-surface)"
        stroke={stroke}
        strokeWidth={1.8}
      />
    </g>
  );
}

function SparklineSvgCanvas(p: {
  points: readonly PlotPoint[];
  paths: { line: string; area: string };
  targetY: number | null;
  stroke: string;
  gradientId: string;
  hoverIndex: number | null;
}) {
  const last = p.points[p.points.length - 1];
  const active = p.hoverIndex !== null ? (p.points[p.hoverIndex] ?? null) : null;
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-full w-full overflow-visible"
      role="img"
      aria-label="价格趋势曲线"
    >
      <defs>
        <linearGradient id={p.gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.stroke} stopOpacity={0.18} />
          <stop offset="100%" stopColor={p.stroke} stopOpacity={0.01} />
        </linearGradient>
      </defs>
      {p.targetY !== null ? (
        <line
          x1={PAD_X}
          x2={VIEW_W - PAD_X}
          y1={p.targetY}
          y2={p.targetY}
          stroke="var(--border-strong)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ) : null}
      <path d={p.paths.area} fill={`url(#${p.gradientId})`} />
      <path
        d={p.paths.line}
        fill="none"
        stroke={p.stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <SparklineMarker active={active} last={last} stroke={p.stroke} />
    </svg>
  );
}

function SparklineHoverBadge({ point }: { point: PlotPoint }) {
  const alignClass = point.x < VIEW_W * 0.45 ? "left-0" : "right-0";
  return (
    <div
      className={`pointer-events-none absolute bottom-full z-20 mb-1.5 whitespace-nowrap rounded-badge border border-strong bg-surface-elevated px-2 py-0.5 font-mono text-xs text-ink-primary shadow-dropdown tabular-nums ${alignClass}`}
    >
      <span className="mr-1.5 font-sans text-ink-muted">{point.label}</span>
      <span className="font-semibold">${point.price.toFixed(2)}</span>
    </div>
  );
}

export const ValuationSparkline = memo(function ValuationSparkline({
  data,
  tone = "ink",
  targetPrice,
}: ValuationSparklineProps) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const { points, targetY, paths } = useMemo(() => {
    const geom = buildGeometry(data, targetPrice);
    return { ...geom, paths: buildSmoothPaths(geom.points) };
  }, [data, targetPrice]);

  if (data.length === 0) {
    return <div aria-hidden="true" className="h-16 w-full rounded-control bg-muted/40" />;
  }

  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1)));
    setHoverIndex(Math.round(ratio * (points.length - 1)));
  };

  return (
    <div
      onPointerMove={handleMove}
      onPointerLeave={() => setHoverIndex(null)}
      className="relative h-16 w-full select-none"
    >
      <div className="kanon-sparkline-reveal h-full w-full">
        <SparklineSvgCanvas
          points={points}
          paths={paths}
          targetY={targetY}
          stroke={resolveStrokeVar(tone)}
          gradientId={gradientId}
          hoverIndex={hoverIndex}
        />
      </div>
      {hoveredPoint ? <SparklineHoverBadge point={hoveredPoint} /> : null}
    </div>
  );
});
