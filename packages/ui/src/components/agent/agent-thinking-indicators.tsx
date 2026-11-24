"use client";

import { useEffect, useState } from "react";

const DOTS_GRID = 3;
const DOTS_SIZE = 4;
const DOTS_GAP = 2;
const DOTS_TICK_MS = 80;
const DOTS_FADE_MS = 220;
const DOTS_TRAIL = 0.3;
const DOTS_MIN_OPACITY = 0.14;
const DOTS_PHASE_STEP = 1 / 8;
const DOTS_SEED = [0.55, 0.3, 0.15, 0.85, 0.55, 0.3, 1, 0.85, 0.55];
const DOT_CELLS = [
  { id: "r0c0", idx: 0 },
  { id: "r0c1", idx: 1 },
  { id: "r0c2", idx: 2 },
  { id: "r1c0", idx: 3 },
  { id: "r1c1", idx: 4 },
  { id: "r1c2", idx: 5 },
  { id: "r2c0", idx: 6 },
  { id: "r2c1", idx: 7 },
  { id: "r2c2", idx: 8 },
] as const;

const STAR_PERIOD_S = 1.4;
const STAR_SIZE = 13;
const STAR_LAYOUT = [
  { x: 50, y: 46, scale: 1 },
  { x: 18, y: 22, scale: 0.55 },
  { x: 82, y: 26, scale: 0.45 },
  { x: 78, y: 76, scale: 0.55 },
  { x: 22, y: 78, scale: 0.4 },
] as const;
const STAR_PATH = "M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z";
const INFINITY_PATH = "M28 14C33 5 47 5 47 14C47 23 33 23 28 14C23 5 9 5 9 14C9 23 23 23 28 14Z";

function dotScalar(variant: "wave" | "spin", col: number, row: number): number {
  const m = DOTS_GRID - 1;
  if (variant === "wave") return ((col + row) / (2 * m)) * (DOTS_GRID / (DOTS_GRID + 1));
  const center = m / 2;
  return (Math.atan2(row - center, col - center) / (2 * Math.PI) + 1) % 1;
}

function computeDotOpacities(variant: "wave" | "spin", phase: number): number[] {
  return Array.from({ length: DOTS_GRID * DOTS_GRID }, (_, i) => {
    const s = dotScalar(variant, i % DOTS_GRID, Math.floor(i / DOTS_GRID));
    const behind = (phase - s + 1) % 1;
    const lit = Math.max(0, 1 - behind / DOTS_TRAIL) ** 1.5;
    return DOTS_MIN_OPACITY + (1 - DOTS_MIN_OPACITY) * lit;
  });
}

export function DotsIndicator({ variant }: { variant: "wave" | "spin" }) {
  const [opacities, setOpacities] = useState<number[]>(DOTS_SEED);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let phase = 0;
    const id = window.setInterval(() => {
      phase = (phase + DOTS_PHASE_STEP) % 1;
      setOpacities(computeDotOpacities(variant, phase));
    }, DOTS_TICK_MS);
    return () => window.clearInterval(id);
  }, [variant]);

  return (
    <span
      aria-hidden="true"
      className="grid shrink-0"
      style={{ gridTemplateColumns: `repeat(${DOTS_GRID}, ${DOTS_SIZE}px)`, gap: DOTS_GAP }}
    >
      {DOT_CELLS.map((cell) => (
        <span
          key={cell.id}
          className="rounded-[1px] bg-current"
          style={{
            width: DOTS_SIZE,
            height: DOTS_SIZE,
            opacity: opacities[cell.idx] ?? DOTS_MIN_OPACITY,
            transition: `opacity ${DOTS_FADE_MS}ms ease`,
          }}
        />
      ))}
    </span>
  );
}

export function StarsIndicator() {
  const box = STAR_SIZE * 1.5;
  return (
    <span
      aria-hidden="true"
      className="relative block shrink-0"
      style={{ width: box, height: box }}
    >
      {STAR_LAYOUT.map((star, i) => {
        const size = STAR_SIZE * star.scale;
        return (
          <svg
            key={`star-${star.x}-${star.y}`}
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="kanon-agent-star absolute"
            style={{
              width: size,
              height: size,
              left: `${star.x}%`,
              top: `${star.y}%`,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              animationDuration: `${STAR_PERIOD_S}s`,
              animationDelay: `${(i * STAR_PERIOD_S * 0.7) / STAR_LAYOUT.length}s`,
            }}
          >
            <path d={STAR_PATH} fill="currentColor" />
          </svg>
        );
      })}
    </span>
  );
}

export function InfinityIndicator() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 56 28"
      className="shrink-0"
      style={{ width: 30, height: 15, margin: "0 -3px" }}
    >
      <path d={INFINITY_PATH} fill="none" stroke="currentColor" strokeWidth={2.75} opacity={0.16} />
      <path
        d={INFINITY_PATH}
        pathLength={100}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.75}
        strokeLinecap="round"
        strokeDasharray="12 88"
        className="kanon-agent-comet"
        style={{ animationDuration: "1.2s" }}
      />
    </svg>
  );
}
