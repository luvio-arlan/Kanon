"use client";

import type { CSSProperties } from "react";
import { cn } from "../../lib/cn";

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<SpinnerSize, { box: number; line: number }> = {
  xs: { box: 12, line: 1.5 },
  sm: { box: 16, line: 2 },
  md: { box: 20, line: 2 },
  lg: { box: 24, line: 2.5 },
  xl: { box: 32, line: 3 },
};

interface ArcLayerProps {
  box: number;
  line: number;
  width: number;
  blur: number;
  opacity: number;
  arc: number;
  lag: number;
}

function OrbitArcLayer({ box, line, width, blur, opacity, arc, lag }: ArcLayerProps) {
  const center = box / 2 - line / 2;
  const inner = center - width / 2;
  const outer = center + width / 2;
  const bleed = Math.max(0, outer + blur * 2 - box / 2);
  const ring = `radial-gradient(circle, transparent ${inner}px, var(--ink-primary) ${inner + 0.5}px, var(--ink-primary) ${outer - 0.5}px, transparent ${outer}px)`;
  const wrapperStyle: CSSProperties = {
    inset: -bleed,
    filter: blur > 0 ? `blur(${blur}px)` : undefined,
    opacity,
    rotate: `${-lag}deg`,
  };
  return (
    <span aria-hidden="true" className="absolute" style={wrapperStyle}>
      <span
        className="absolute inset-0"
        style={{
          background: `conic-gradient(transparent ${360 - arc}deg, currentColor 360deg)`,
          maskImage: ring,
          WebkitMaskImage: ring,
        }}
      />
    </span>
  );
}

function SpinnerGlyph({ box, line, track }: { box: number; line: number; track: boolean }) {
  return (
    <>
      {track ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-pill border-current opacity-15"
          style={{ borderWidth: line }}
        />
      ) : null}
      <span aria-hidden="true" className="kanon-spinner-orbit absolute inset-0">
        <OrbitArcLayer
          box={box}
          line={line}
          width={line * 4}
          blur={line * 1.6}
          opacity={0.3}
          arc={110}
          lag={22}
        />
        <OrbitArcLayer
          box={box}
          line={line}
          width={line * 2}
          blur={line * 0.6}
          opacity={0.58}
          arc={200}
          lag={9}
        />
        <OrbitArcLayer box={box} line={line} width={line} blur={0} opacity={1} arc={290} lag={0} />
        <span
          className="absolute left-1/2 top-0 rounded-pill bg-current"
          style={{ width: line, height: line, translate: "-50% 0" }}
        />
      </span>
    </>
  );
}

export interface SpinnerProps {
  size?: SpinnerSize;
  track?: boolean;
  label?: string;
  decorative?: boolean;
  className?: string;
}

export function Spinner({
  size = "sm",
  track = true,
  label = "加载中",
  decorative = false,
  className,
}: SpinnerProps) {
  const { box, line } = SIZES[size];
  const baseClass = cn("relative inline-flex shrink-0 text-accent-coral", className);
  const style = { width: box, height: box };

  if (decorative) {
    return (
      <span aria-hidden="true" className={baseClass} style={style}>
        <SpinnerGlyph box={box} line={line} track={track} />
      </span>
    );
  }
  return (
    <output aria-label={label} className={baseClass} style={style}>
      <SpinnerGlyph box={box} line={line} track={track} />
    </output>
  );
}
