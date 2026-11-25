"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "../../lib/cn";

export interface ComposerLoaderProps {
  children: ReactNode;
  active?: boolean;
  radius?: number;
  speed?: number;
  arc?: number;
  className?: string;
}

interface BeamSvgProps {
  id: string;
  w: number;
  h: number;
  rx: number;
  speed: number;
  band: number;
}

function BeamStrokeLayers({ id, w, h, rx, speed, band }: BeamSvgProps) {
  const cornerR = Math.min(rx, w / 2, h / 2);
  const perimeter = Math.max(1, 2 * (w + h) - 8 * cornerR + 2 * Math.PI * cornerR);
  const pxUnits = (px: number) => (px * 100) / perimeter;
  const phase = (len: number, backPx: number) => len - band + pxUnits(backPx);

  const layers = [
    { key: "bloom", width: 12, blur: `${id}-b10`, opacity: 0.22, len: band * 0.9, back: 20 },
    { key: "glow", width: 4.5, blur: `${id}-b4`, opacity: 0.6, len: band * 0.95, back: 8 },
    { key: "line", width: 1.5, blur: undefined, opacity: 0.92, len: band, back: 0 },
  ];

  return (
    <>
      {layers.map((layer) => (
        <rect
          key={layer.key}
          x={1}
          y={1}
          width={Math.max(1, w - 2)}
          height={Math.max(1, h - 2)}
          rx={Math.max(0, rx - 1)}
          pathLength={100}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={layer.width}
          strokeLinecap="round"
          strokeDasharray={`${layer.len} ${100 - layer.len}`}
          className="kanon-beam-rect"
          filter={layer.blur ? `url(#${layer.blur})` : undefined}
          style={{
            opacity: layer.opacity,
            animationDuration: `${speed}s`,
            animationDelay: `${(phase(layer.len, layer.back) * speed) / 100}s`,
          }}
        />
      ))}
    </>
  );
}

function BeamOverlaySvg({ id, w, h, rx, speed, band }: BeamSvgProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--agent-beam-start)" />
          <stop offset="50%" stopColor="var(--agent-beam-mid)" />
          <stop offset="100%" stopColor="var(--agent-beam-end)" />
        </linearGradient>
        <filter id={`${id}-b10`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id={`${id}-b4`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <BeamStrokeLayers id={id} w={w} h={h} rx={rx} speed={speed} band={band} />
    </svg>
  );
}

export function ComposerLoader({
  children,
  active = false,
  radius = 20,
  speed = 4.2,
  arc = 115,
  className,
}: ComposerLoaderProps) {
  const id = `kanon-beam-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const clipRef = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState({ w: 440, h: 96 });

  useEffect(() => {
    if (!active) return;
    const el = clipRef.current;
    if (!el) return;
    const measure = () =>
      setBox({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  return (
    <div className={cn("relative", className)}>
      {active ? (
        <span
          ref={clipRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden transition-opacity duration-500"
          style={{ borderRadius: radius }}
        >
          <BeamOverlaySvg
            id={id}
            w={box.w}
            h={box.h}
            rx={radius}
            speed={speed}
            band={(arc / 360) * 100}
          />
        </span>
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}
